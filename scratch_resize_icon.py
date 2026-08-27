import sys
try:
    from PIL import Image
    
    img = Image.open('build/icon.png')
    img = img.resize((256, 256), Image.Resampling.LANCZOS)
    img.save('build/icon.png')
    print("Successfully resized build/icon.png to 256x256")
    
    try:
        img.save('build/icon.ico', format='ICO', sizes=[(256, 256)])
        print("Successfully created build/icon.ico at 256x256")
    except Exception as e:
        print(f"Could not save .ico: {e}")
        
except Exception as e:
    print(f"Error: {e}")
