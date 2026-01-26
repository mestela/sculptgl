
class StateVoxel {

  constructor(main, voxelState) {
    this._main = main;
    this._voxelState = voxelState;
    // Snapshot the Distance Field (Deep Copy)
    this._distanceField = new Float32Array(voxelState.getDistanceField());
  }

  isNoop() {
    return this._distanceField.length === 0;
  }

  undo() {
    this._voxelState.setDistanceField(this._distanceField);
    // Find the tool and force update?
    // Ideally VoxelState should emit change or we call tool update.
    // Let's assume global tool or Main access?
    // Accessing via Global for now as VoxelTool is singleton-ish in this context
    if (window.voxelTool) {
      window.voxelTool.updateMesh();
      window.voxelTool._main.render();
    }
  }

  redo() {
    this.undo();
  }

  createRedo() {
    return new StateVoxel(this._main, this._voxelState);
  }
}

export default StateVoxel;
