# WebXR File I/O Feasibility on Quest 3

**Status:** Feasible
**Hosting:** Static Hosting Compatible (Zero Backend Required)
**Client:** Native Quest Browser / Wolvic

## Overview
Based on investigation of `src/files/ImportOBJ.js` and `ExportOBJ.js`, adding Save/Load functionality to the VR experience is completely viable without any server-side infrastructure.

## user Workflow (The "Context Switch")
Because WebXR runs in a sandboxed environment, file operations trigger a "Context Switch" to a 2D windowed mode.

### 1. Importing (Loading)
-   **Mechanism:** Standard `<input type="file">` element (already present in `xr_poc.html`).
-   **UX Flow:**
    1.  User clicks "Import" in VR Menu.
    2.  Check for `input` element existence (ensure it's not hidden/removed in VR mode).
    3.  Programmatically trigger `.click()`.
    4.  **Context Switch:** Quest pauses VR, opens 2D System File Picker overlay.
    5.  User selects file from internal storage (e.g., `/Downloads`).
    6.  **Resume:** VR Session resumes, file data is read via `FileReader` (client-side), mesh appears.

### 2. Exporting (Saving)
-   **Mechanism:** `FileSaver.js` (Blob download).
-   **UX Flow:**
    1.  User clicks "Export" in VR Menu.
    2.  `ExportOBJ.js` generates string data in memory.
    3.  `FileSaver.saveAs(blob)` is called.
    4.  **Context Switch:** Quest triggers "Download" system dialog/notification.
    5.  File is saved to device `/Downloads` folder.
    6.  User stays in VR (or might see a brief toast notification).

## Technical Details

### Static Hosting Compatibility
-   **Verified:** `ImportOBJ.js` uses `FileReader` and splits strings in-memory.
-   **Verified:** `ExportOBJ.js` creates a `Blob` URL.
-   **Conclusion:** No Node.js export server is required. This works on GitHub Pages, DreamHost, or any static HTTP server.

### Constraints
-   **File System Access:** Browsers cannot write to arbitrary folders (like `/Android/data`). They are restricted to the Downloads sandbox.
-   **UX Friction:** The switch between "Immersive VR" and "2D System Overlay" is unavoidable for security reasons.

## Implementation Plan
1.  **UI:** Add "Import" and "Export" buttons to the VR Wrist Menu (`GuiXR.js`).
2.  **Events:** Map these buttons to trigger the existing `GuiFiles.js` logic (or a VR-specific wrapper).
3.  **Testing:** Verify the `fileopen` input element is reachable and clickable from the VR session context.
