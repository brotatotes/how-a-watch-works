import sys
from PIL import Image, ImageDraw
d, pre, out = sys.argv[1], sys.argv[2], sys.argv[3]
ims = [Image.open(f'{d}/{pre}-{i}.png').convert('RGB') for i in range(9)]
w = 480; h = int(ims[0].height * w / ims[0].width)
S = Image.new('RGB', (w*3, h*3), 'white'); dr = ImageDraw.Draw(S)
for i, im in enumerate(ims):
    S.paste(im.resize((w, h)), ((i%3)*w, (i//3)*h)); dr.text(((i%3)*w+8, (i//3)*h+8), str(i), fill='red')
S.save(out)
