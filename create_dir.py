import os
import shutil

base_path = r'C:/Users/xv367/OneDrive/바탕 화면/link2025'

# Create images directory
images_dir = os.path.join(base_path, 'public', 'images')
os.makedirs(images_dir, exist_ok=True)

# Move 003.png and 004.png
shutil.move(os.path.join(base_path, '003.png'), os.path.join(images_dir, '003.png'))
shutil.move(os.path.join(base_path, '004.png'), os.path.join(images_dir, '004.png'))
