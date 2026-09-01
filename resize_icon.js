import { app, nativeImage } from 'electron';
import fs from 'fs';

app.whenReady().then(() => {
    const img = nativeImage.createFromPath('app_tray_icon.png');
    
    fs.writeFileSync('trayIconTemplate.png', img.resize({ height: 18 }).toPNG());
    fs.writeFileSync('trayIconTemplate@2x.png', img.resize({ height: 36 }).toPNG());
    fs.writeFileSync('trayIconTemplate@3x.png', img.resize({ height: 54 }).toPNG());
    
    console.log('Icons resized successfully');
    app.quit();
});
