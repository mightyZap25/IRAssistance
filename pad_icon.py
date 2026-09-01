from PIL import Image, ImageDraw

try:
    # Open original icon
    img = Image.open('build/icon.png').convert("RGBA")
    
    orig_w, orig_h = img.size
    
    # Create a rounded mask
    mask = Image.new('L', (orig_w, orig_h), 0)
    draw = ImageDraw.Draw(mask)
    
    # Apple standard corner radius is roughly 22.5% of the dimension
    radius = int(orig_w * 0.225)
    
    draw.rounded_rectangle((0, 0, orig_w, orig_h), radius=radius, fill=255)
    
    # Apply the mask to make the image rounded
    rounded_img = Image.new('RGBA', (orig_w, orig_h), (0,0,0,0))
    rounded_img.paste(img, (0, 0), mask)
    
    # Calculate new size with padding (e.g. 25% padding overall)
    # So the image is ~80% of the canvas
    new_w = int(orig_w * 1.25)
    new_h = int(orig_h * 1.25)
    
    final_canvas = Image.new('RGBA', (new_w, new_h), (0, 0, 0, 0))
    
    # Paste rounded image in center
    offset_x = (new_w - orig_w) // 2
    offset_y = (new_h - orig_h) // 2
    final_canvas.paste(rounded_img, (offset_x, offset_y))
    
    # Resize back to original dimensions for the file
    final_img = final_canvas.resize((orig_w, orig_h), Image.Resampling.LANCZOS)
    
    # Save as padded icon
    final_img.save('build/icon_dock.png')
    print("Created build/icon_dock.png with rounded corners and padding")
except Exception as e:
    print(f"Error: {e}")

