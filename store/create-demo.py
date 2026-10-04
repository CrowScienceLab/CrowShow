from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

root = Path(__file__).resolve().parent
pdfmetrics.registerFont(TTFont('Korean', 'C:/Windows/Fonts/malgun.ttf'))
pdfmetrics.registerFont(TTFont('KoreanBold', 'C:/Windows/Fonts/malgunbd.ttf'))
c = canvas.Canvas(str(root / 'assets/CrowShow-demo.pdf'), pagesize=(1280, 720))
c.setTitle('CrowShow 수업 자료 예시')
c.setAuthor('Crow Science Lab')
def text(x, y, value, size=24, color='#17243A', bold=False):
    c.setFillColor(HexColor(color))
    c.setFont('KoreanBold' if bold else 'Korean', size)
    c.drawString(x, y, value)
def box(x, y, w, h, fill):
    c.setFillColor(HexColor(fill)); c.roundRect(x,y,w,h,16,stroke=0,fill=1)
def header(w, h, tag, title, subtitle):
    c.setFillColor(HexColor('#F4F7FC'));c.rect(0,0,w,h,stroke=0,fill=1)
    text(64,h-70,tag,16,'#2675E8',True)
    text(64,h-136,title,42,bold=True)
    text(64,h-178,subtitle,20,'#61718B')
header(1280,720,'CROWSHOW · SCIENCE CLASS','기체의 압력과 부피','그래프를 보며 설명하고, 중요한 내용을 바로 필기하세요.')
box(64,110,580,365,'#FFFFFF');box(675,110,540,365,'#E5EEFC')
text(100,425,'온도가 일정할 때',26,bold=True)
text(100,380,'부피가 작아지면 압력은 커집니다.',22)
text(100,328,'생각해 보기',20,'#2675E8',True)
text(100,286,'주사기 끝을 막고 밀면',24)
text(100,248,'왜 점점 더 힘이 들까요?',24)
text(100,170,'핵심 관계   P × V = 일정',25,'#184B99',True)
text(718,425,'압력과 부피의 관계',23,bold=True)
c.setStrokeColor(HexColor('#60738F'));c.setLineWidth(2);c.line(748,174,748,364);c.line(748,174,1155,174)
text(718,375,'P',20);text(1167,168,'V',20)
c.setStrokeColor(HexColor('#2675E8'));c.setLineWidth(5)
p=c.beginPath();p.moveTo(775,344);p.curveTo(823,214,968,197,1120,191);c.drawPath(p)
text(64,56,'CrowShow 예시 문서 · PDF 발표 / 필기 / 확대 / 스크롤',15,'#61718B')
c.showPage();c.setPageSize((800,1400))
header(800,1400,'CROWSHOW · READING','긴 문서도 편하게','너비 맞춤과 스크롤로 필요한 내용을 확인하세요.')
for i,(title,lines) in enumerate([
 ('01  관찰하기',['주사기의 부피를 천천히 바꿔 봅니다.','밀 때와 당길 때의 차이를 관찰합니다.']),
 ('02  기록하기',['부피와 압력의 변화를 표에 기록합니다.','중요한 값은 펜이나 형광펜으로 표시합니다.']),
 ('03  설명하기',['전체 화면으로 자료를 보여 줍니다.','그래프의 작은 부분은 확대해서 설명합니다.']),
 ('04  정리하기',['발표 메모를 남기고 자료를 저장합니다.','필기를 포함한 PDF로 결과를 내보냅니다.'])]):
 y=920-i*250;box(64,y,672,220,'#FFFFFF');text(95,y+165,title,27,bold=True)
 for j,line in enumerate(lines):text(95,y+110-j*40,line,21)
text(64,60,'CrowShow 예시 문서 · 세로 문서 읽기',15,'#61718B')
c.showPage();c.setPageSize((1280,720))
header(1280,720,'CROWSHOW · LESSON REVIEW','수업의 흐름을 한 화면에','발표자 메모와 타이머로 수업을 준비하세요.')
for i,(title,sub) in enumerate([('관찰','현상을 살펴보기'),('질문','원인을 생각하기'),('설명','자료에 필기하기')]):
 x=64+i*400;box(x,140,360,300,['#E5EEFC','#E5F5EF','#FFF2DD'][i]);text(x+28,370,f'0{i+1}',24,'#2675E8',True);text(x+28,300,title,36,bold=True);text(x+28,235,sub,22)
text(64,60,'CrowShow 예시 문서 · 원본 문서는 그대로, 설명은 자유롭게',15,'#61718B')
c.save()
print(root / 'assets/CrowShow-demo.pdf')
