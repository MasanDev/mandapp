import torch,re,json
from loadsnu import load
from transformers import Wav2Vec2Config,Wav2Vec2ForCTC
P='/tmp/claude-0/models/snu-nia-12__wav2vec2-large-xlsr-53_nia12_phone-pinyin_chinese/'
ck=load(P+'pytorch_model.bin'); sd=ck['model']
cfg=Wav2Vec2Config.from_pretrained(P); cfg.pad_token_id=0  # fairseq blank = <s> idx0
m=Wav2Vec2ForCTC(cfg); tgt=m.state_dict(); new={}
for k,v in sd.items():
    k2=k.replace('w2v_encoder.w2v_model.','wav2vec2.').replace('w2v_encoder.proj','lm_head')
    k2=re.sub(r'conv_layers\.(\d+)\.0\.',r'conv_layers.\1.conv.',k2)
    k2=re.sub(r'conv_layers\.(\d+)\.2\.1\.',r'conv_layers.\1.layer_norm.',k2)
    k2=k2.replace('wav2vec2.layer_norm.','wav2vec2.feature_projection.layer_norm.').replace('post_extract_proj','feature_projection.projection')
    k2=k2.replace('mask_emb','masked_spec_embed').replace('pos_conv.0.bias','pos_conv_embed.conv.bias')
    k2=k2.replace('pos_conv.0.weight_g','pos_conv_embed.conv.parametrizations.weight.original0').replace('pos_conv.0.weight_v','pos_conv_embed.conv.parametrizations.weight.original1')
    k2=k2.replace('self_attn_layer_norm','layer_norm').replace('self_attn.','attention.').replace('fc1','feed_forward.intermediate_dense').replace('fc2','feed_forward.output_dense')
    new[k2]=v.float()
miss=set(tgt)-set(new); extra=set(new)-set(tgt)
print('missing',sorted(miss)[:10],'extra',sorted(extra)[:10])
for k in new:
    if k in tgt and tgt[k].shape!=new[k].shape: print('shape',k,tgt[k].shape,new[k].shape)
m.load_state_dict(new,strict=False)
m.save_pretrained('/tmp/claude-0/models/snu_hf')
sym=ck['task_state']['target_dictionary'].__dict__['symbols']
json.dump(sym,open('/tmp/claude-0/models/snu_hf/symbols.json','w'),ensure_ascii=False)
