from pathlib import Path
from pypdf import PdfReader

pdf = Path(__file__).resolve().parent.parent / "data" / "libros" / "Introduccion_a_Javascript-Eguiluz_Perez_Javier.pdf"
reader = PdfReader(str(pdf))

page_num = 5  # 1-index
txt = reader.pages[page_num - 1].extract_text() or ""

print("LEN:", len(txt))
print("----- START -----")
print(txt[:1500])
print("----- END -----")
