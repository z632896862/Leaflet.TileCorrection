# Leaflet.TileCorrection
## leaflet切片图层自定义坐标系插件
地图坐标系可以使用EPSG4326，切片坐标系依照切片时定义的坐标系<br>
注：地图使用坐标系需与切片坐标系投影方式相同

### 使用

npm install leaflet.tilecorrection

```javascript
import L from "leaflet";
import "proj4leaflet";
import "leaflet.tilecorrection";
let CRS_4490 = new L.Proj.CRS(
        "EPSG:4490",
        "+proj=longlat +ellps=GRS80 +no_defs",
        {
          resolutions: [
            0.00549933137239034, // Level 0
            0.00274966568619517, // Level 1
            0.00137483284309758, // Level 2
            0.000687416421548792, // Level 3
            0.000343708210774396, // Level 4
            0.000171854105387198,
            8.5927052693599e-5,
            4.29635263467995e-5,
            2.14817631733998e-5,
            1.07408815866999e-5,
            5.37044079334994e-6,
            2.68522039667497e-6,
            1.34261019833748e-6,
          ],
          origin: [118.122911693886, 31.2869311022836]
        }
      );
let map = L.map("map", {
        minZoom: 1,
        maxZoom: 20,
        center: [30.0869311022836, 119.822911693886],
        zoom: 7,
        crs: L.CRS.EPSG4326,
        customCRS: {
          crs4490: { 
              crs: CRS_4490,
              startZoom: 7
          }
        },
      });
let url = "http://XXX:XXX/rest/services/layer/Mapserver/";
var basemap = new L.TileLayer(url + "/tile/{z}/{y}/{x}", {
        tileSize: 256,
        maxZoom: 20,
        minZoom: 7,
        crs: "crs4490",
      });
```