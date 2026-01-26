# SculptXR Interaction Design & Scope

## 1. Controller Paradigm
**"Right is Might, Left is Meta"**

*   **Right Hand (Primary)**
    *   **Role**: Action & Execution.
    *   **Functions**: Sculpting, Painting, UI Interaction (Laser Pointer).
    *   **Inputs**:
        *   `Trigger`: Perform Action (Sculpt).
        *   `Thumbstick`: Tool parameters (Radius +/-).
        *   `Button A/B`: Discrete toggles (if needed).

*   **Left Hand (Meta/Modifier)**
    *   **Role**: Context & Modification.
    *   **Functions**:
        *   **Menu**: Holds the UI Palette.
        *   **Modifier (Alt)**: `Trigger` acts as the global "Shift/Alt" key (e.g., Hold to Subtract/Negative Brush).
        *   **Navigation**: Primary anchor for Two-Handed transform/scale.
    *   **Constraint**: specific "Sculpting" strokes from the Left Hand are currently **disabled** to prevent accidental ghost inputs.

*   **Handedness**: Currently hardcoded **Right-Handed**. System-wide "Swap Hands" setting is deferred.

## 2. Feature Priorities
*   **Core Mechanics (P0)**:
    *   Reliable Sculpting (Add/Sub).
    *   Robust Undo/Redo.
    *   User Agency (Navigation, Menu).
*   **Visual Polish (P2)**:
    *   Smooth Shading / Matcap (Nice to have, but not blocking).
