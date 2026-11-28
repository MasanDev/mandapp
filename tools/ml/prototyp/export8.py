import torch,sys
from transformers import Wav2Vec2ForCTC
L=int(sys.argv[1])
m=Wav2Vec2ForCTC.from_pretrained('/tmp/claude-0/models/snu_hf',attn_implementation='eager').eval()
m.wav2vec2.encoder.layers=m.wav2vec2.encoder.layers[:L]; m.wav2vec2.encoder.layer_norm=torch.nn.Identity()
head=torch.nn.Sequential(torch.nn.LayerNorm(1024),torch.nn.Linear(1024,1024),torch.nn.GELU(),torch.nn.Linear(1024,218)); head.load_state_dict(torch.load(f'head{L}.pt'))
class W(torch.nn.Module):
    def __init__(s): super().__init__(); s.w=m.wav2vec2; s.h=head
    def forward(s,x):
        x=(x-x.mean())/(x.std()+1e-7)
        h=s.w(x).last_hidden_state; return torch.log_softmax(s.h(h),-1), h
w=W().eval()
torch.onnx.export(w,(torch.randn(1,32000),),f'/tmp/claude-0/models/l{L}_fp32.onnx',input_names=['audio'],output_names=['logp','hidden'],dynamic_axes={'audio':{1:'n'},'logp':{1:'t'},'hidden':{1:'t'}},opset_version=17,dynamo=False)
from onnxruntime.quantization import quantize_dynamic,QuantType
quantize_dynamic(f'/tmp/claude-0/models/l{L}_fp32.onnx',f'/tmp/claude-0/models/l{L}_int8.onnx',weight_type=QuantType.QUInt8)
