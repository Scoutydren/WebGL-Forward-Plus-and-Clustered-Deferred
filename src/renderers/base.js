import TextureBuffer from './textureBuffer';
import { vec4 } from 'gl-matrix';

export const MAX_LIGHTS_PER_CLUSTER = 100;

export default class BaseRenderer {
  constructor(xSlices, ySlices, zSlices) {
    // Create a texture to store cluster data. Each cluster stores the number of lights followed by the light indices
    this._clusterTexture = new TextureBuffer(xSlices * ySlices * zSlices, MAX_LIGHTS_PER_CLUSTER + 1);
    this._xSlices = xSlices;
    this._ySlices = ySlices;
    this._zSlices = zSlices;
  }

  updateClusters(camera, viewMatrix, scene) {
    // Reset the light count to 0 for every cluster
    for (let z = 0; z < this._zSlices; ++z) {
      for (let y = 0; y < this._ySlices; ++y) {
        for (let x = 0; x < this._xSlices; ++x) {
          let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
          this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = 0;
        }
      }
    }

    // Calculate frustum values
    let zDist = camera.far - camera.near;
    let FovY = 2 * Math.tan(camera.fov * Math.PI / 360.0);
    let FovX = camera.aspect * FovY;

    //Function to clamp values
    function clamp(value, max) {
      return Math.min(Math.max(value, 0), max);
    }

    // The naive method is to loop through all the clusters and check if each light has influence on the cluster
    // Instead of using the naive method, we use a AABB bounding box along all three dimensions to improve the performance

    // Loop through all the lights
    for (let lightIdx = 0; lightIdx < scene.lights.length; lightIdx++)
    {
      //Get the position of the current light and transform it into camera view space
      let curLight = scene.lights[lightIdx];
      let lightPosWorld = vec4.fromValues(curLight.position[0], curLight.position[1], curLight.position[2], 1.0);
      let lightPosCamera = vec4.create();
      vec4.transformMat4(lightPosCamera, lightPosWorld, viewMatrix);
      lightPosCamera[2] *= -1.0; //reverse z direction

      //We create the AABB bounding box in the camera view space
      let lightX = lightPosCamera[0],
          lightY = lightPosCamera[1],
          lightZ = lightPosCamera[2];

      let w = FovX * lightZ;
      let h = FovY * lightZ;

      let strideZ = zDist / this._zSlices,
          strideX = w / this._xSlices,
          strideY = h / this._ySlices;

      let r = curLight.radius;

      //Calculate the min and max slice indices, position divided by stride(step)
      let maxSliceZ = Math.floor((lightZ - camera.near + r) / strideZ),
          minSliceZ = Math.floor((lightZ - camera.near - r) / strideZ),
          maxSliceX = Math.floor((w / 2 + lightX + r) / strideX),
          minSliceX = Math.floor((w / 2 + lightX - r) / strideX),
          maxSliceY = Math.floor((h / 2 + lightY + r) / strideY),
          minSliceY = Math.floor((h / 2 + lightY - r) / strideY);

      //clamp the values because adding the radius might cause out of bound
      maxSliceZ = clamp(maxSliceZ, this._zSlices - 1);
      minSliceZ = clamp(minSliceZ,  this._zSlices - 1);
      maxSliceX = clamp(maxSliceX, this._xSlices - 1);
      minSliceX = clamp(minSliceX, this._xSlices - 1);
      maxSliceY = clamp(maxSliceY, this._ySlices - 1);
      minSliceY = clamp(minSliceY, this._ySlices - 1);

      // Only loop through the bounding box
      for (let z = minSliceZ; z <= maxSliceZ; z++) {
        for (let y = minSliceY; y <= maxSliceY; y++) {
          for (let x = minSliceX; x <= maxSliceX; x++) {
            let i = x + y * this._xSlices + z * this._xSlices * this._ySlices;
            let countCurCluster = this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)];
            // check if the count of lights in current cluster has reached maximum
            if (countCurCluster >= MAX_LIGHTS_PER_CLUSTER) {
              continue;
            }
            countCurCluster++;
            //since the texture is stored with groups of 4 (rgba format)
            let groupIdx = Math.floor(countCurCluster / 4);
            let groupOffset = Math.floor(countCurCluster % 4);
            this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, 0)] = countCurCluster;
            this._clusterTexture.buffer[this._clusterTexture.bufferIndex(i, groupIdx) + groupOffset] = lightIdx;
          }
        }
      }
    }

    this._clusterTexture.update();
  }
}