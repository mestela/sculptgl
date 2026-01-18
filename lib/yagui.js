class MockController {
  constructor() {
    this.domContainer = document.createElement('div');
    this.domButton = document.createElement('div'); // Added this
    this.domSelect = document.createElement('div'); // Just in case
    this.domCheckbox = document.createElement('div'); // Just in case
  }
  onChange() { return this; }
  setValue() { return this; }
  getValue() { return 0; }
  setMax() { return this; }
  setMin() { return this; }
  setStep() { return this; }
  setStep() { return this; }
  setVisibility() { }
  setEnable() { }
  addOptions() { } // Added this (GuiSculpting uses it)
}

class MockContainer {
  constructor() {
    this.domContainer = document.createElement('div');
    this.domTopbar = this.domContainer;
  }
  addTitle() { return new MockController(); }
  addSlider() { return new MockController(); }
  addColor() { return new MockController(); }
  addCheckbox() { return new MockController(); }
  addButton() { return new MockController(); }
  addDualButton() {
    return [new MockController(), new MockController()]; // Must return array!
  }
  addMenu() { return new MockContainer(); }
  addExtra() { return new MockContainer(); }
  addCombobox() { return new MockController(); }
  addFile() { return new MockController(); }
  addSpan() { return new MockController(); }
  setVisibility() { }
  close() { }
  open() { }
}

class MockGUI {
  constructor(viewport, callback) {
    console.warn("Mock GuiMain initialized");
    this.domMain = document.createElement('div');
    this.domTopbar = document.createElement('div');
    this.domSidebar = document.createElement('div');
  }
  addTopbar() {
    return new MockContainer();
  }
  addRightSidebar() {
    return new MockContainer();
  }
  setVisibility() { }
}

const yagui = {
  GuiMain: MockGUI
};

export default yagui;