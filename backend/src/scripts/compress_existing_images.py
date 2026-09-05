import os
import io
import sys
from PIL import Image, ImageOps

TARGET_DIRS = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../frontend/public/img')),
    os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../frontend/public/uploads'))
]

def compress_image(file_path):
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png'):
        return 0, 0, 0

    orig_size = os.path.getsize(file_path)
    if orig_size == 0:
        return 0, 0, 0

    try:
        with Image.open(file_path) as img:
            # Handle EXIF orientation
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            buf = io.BytesIO()
            webp_buf = io.BytesIO()

            if ext in ('.jpg', '.jpeg'):
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(buf, format='JPEG', quality=88, optimize=True, progressive=True)
                img.save(webp_buf, format='WEBP', quality=88, method=6)
            elif ext == '.png':
                # Check for transparency
                if img.mode == 'RGBA':
                    alpha = img.split()[-1]
                    extrema = alpha.getextrema()
                    if extrema == (255, 255):
                        # Completely opaque, can convert to RGB for huge size savings if it is a photo
                        rgb_img = img.convert('RGB')
                        rgb_img.save(buf, format='PNG', optimize=True)
                        rgb_img.save(webp_buf, format='WEBP', quality=88, method=6)
                    else:
                        img.save(buf, format='PNG', optimize=True)
                        img.save(webp_buf, format='WEBP', quality=88, lossless=False, method=6)
                elif img.mode == 'P':
                    img.save(buf, format='PNG', optimize=True)
                    img.save(webp_buf, format='WEBP', quality=88, lossless=False, method=6)
                else:
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    img.save(buf, format='PNG', optimize=True)
                    img.save(webp_buf, format='WEBP', quality=88, method=6)

            new_size = buf.tell()
            # If compressed version is smaller, overwrite original
            if new_size < orig_size:
                with open(file_path, 'wb') as f:
                    f.write(buf.getvalue())
                saved = orig_size - new_size
            else:
                new_size = orig_size
                saved = 0

            # Save parallel .webp version
            webp_path = os.path.splitext(file_path)[0] + '.webp'
            with open(webp_path, 'wb') as f:
                f.write(webp_buf.getvalue())

            return orig_size, new_size, saved
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return orig_size, orig_size, 0

def main():
    total_orig = 0
    total_new = 0
    count = 0

    print("Starting batch image optimization...")
    for target_dir in TARGET_DIRS:
        if not os.path.exists(target_dir):
            continue
        for root, dirs, files in os.walk(target_dir):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in ('.jpg', '.jpeg', '.png'):
                    path = os.path.join(root, file)
                    orig, new, saved = compress_image(path)
                    total_orig += orig
                    total_new += new
                    count += 1

    print(f"\nOptimization Complete!")
    print(f"Processed images: {count}")
    print(f"Original total size: {total_orig / (1024*1024):.2f} MB")
    print(f"Compressed total size: {total_new / (1024*1024):.2f} MB")
    if total_orig > 0:
        reduction = (1 - (total_new / total_orig)) * 100
        print(f"Bandwidth saved: {(total_orig - total_new) / (1024*1024):.2f} MB ({reduction:.1f}% reduction)")

if __name__ == '__main__':
    main()
