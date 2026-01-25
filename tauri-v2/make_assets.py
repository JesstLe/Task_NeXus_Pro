import struct
import base64

def create_valid_png(filename):
    # 1x1 Red Pixel PNG
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    with open(filename, "wb") as f:
        f.write(base64.b64decode(png_b64))
    print(f"Created {filename}")

def create_valid_ico(filename):
    # ICO Header: Reserved=0, Type=1, Count=1
    header = struct.pack('<HHH', 0, 1, 1)

    width = 32
    height = 32
    bpp = 32
    
    xor_size = width * height * 4
    and_row_stride = ((width + 31) // 32) * 4
    and_size = and_row_stride * height
    
    data_size = 40 + xor_size + and_size
    offset = 6 + 16 # Header + 1 Directory Entry

    # Directory Entry: W, H, Colors, Res, Planes, BPP, Size, Offset
    entry = struct.pack('<BBBBHHII', width, height, 0, 0, 1, bpp, data_size, offset)

    # BitmapInfoHeader: Size, W, H, Planes, BPP, Compression, SizeImage...
    bmp_header = struct.pack('<IIIHHIIIIII', 
        40, width, height * 2, 1, bpp, 0, xor_size + and_size, 0, 0, 0, 0
    )
    
    # Pixel Data (Red: 00 00 FF FF)
    pixel = b'\x00\x00\xFF\xFF' 
    xor_data = pixel * (width * height)
    
    # AND Mask (0 = opaque)
    and_data = b'\x00' * and_size
    
    with open(filename, 'wb') as f:
        f.write(header)
        f.write(entry)
        f.write(bmp_header)
        f.write(xor_data)
        f.write(and_data)
        
    print(f"Created {filename}")

if __name__ == "__main__":
    create_valid_png("src-tauri/icons/icon.png")
    create_valid_ico("src-tauri/icons/icon.ico")
