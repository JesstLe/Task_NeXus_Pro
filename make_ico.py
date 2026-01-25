import struct

def create_dummy_ico(filename):
    # ICO Header
    # 0-1: Reserved (0)
    # 2-3: Type (1 = ICO)
    # 4-5: Count (1 image)
    header = struct.pack('<HHH', 0, 1, 1)

    width = 32
    height = 32
    bpp = 32
    
    # BMP Info Header Size = 40
    # Data Size = InfoHeader + XOR Mask (pixels) + AND Mask
    # XOR Mask = W * H * 4 bytes
    # AND Mask = (W * 1 + 31) // 32 * 4 * H (row padded to 4 bytes) -> 4 bytes * 32 = 128 bytes
    
    xor_size = width * height * 4
    and_row_stride = ((width + 31) // 32) * 4
    and_size = and_row_stride * height
    
    data_size = 40 + xor_size + and_size
    offset = 6 + 16 # Header + 1 Directory Entry

    # Directory Entry
    # 0: Width (32)
    # 1: Height (32)
    # 2: Colors (0)
    # 3: Reserved (0)
    # 4-5: Planes (1)
    # 6-7: BPP (32)
    # 8-11: Size (data_size)
    # 12-15: Offset (offset)
    entry = struct.pack('<BBBBHHII', width, height, 0, 0, 1, bpp, data_size, offset)

    # BitmapInfoHeader
    # 0-3: Size (40)
    # 4-7: Width (32)
    # 8-11: Height (32 * 2 for AND mask implication in ICO? No, standard BMP header uses height * 2 usually for icons, but let's stick to simple)
    # Actually for ICO, height in InfoHeader is Height * 2 (XOR + AND masks combined vertically)
    # 12-13: Planes (1)
    # 14-15: BPP (32)
    # 16-19: Compression (0 = BI_RGB)
    # 20-23: SizeImage (xor_size + and_size)
    # ... rest 0
    
    bmp_header = struct.pack('<IIIHHIIIIII', 
        40, width, height * 2, 1, bpp, 0, xor_size + and_size, 0, 0, 0, 0
    )
    
    # Pixel Data (Black, full alpha) -> BGRA
    # Let's make it Red: 00 00 FF FF
    pixel = b'\x00\x00\xFF\xFF' 
    xor_data = pixel * (width * height)
    
    # AND Mask (0 = opaque, 1 = transparent)
    # We want opaque, so 0
    and_data = b'\x00' * and_size
    
    with open(filename, 'wb') as f:
        f.write(header)
        f.write(entry)
        f.write(bmp_header)
        f.write(xor_data)
        f.write(and_data)
        
    print(f"Created {filename}")

if __name__ == "__main__":
    create_dummy_ico("src-tauri/icons/icon.ico")
