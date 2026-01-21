const glMatrix = require('../lib/gl-matrix.js');
const { vec3, quat, mat4 } = glMatrix;

// Mock Scene Context
const context = {
    _vrGrip: {
        right: { active: false, startPoint: vec3.create(), startRot: quat.create() }
    },
    rotateWorld: function(qDelta, origin) {
        console.log(`[rotateWorld] Rotating! w=${qDelta[3].toFixed(6)} Origin=${origin}`);
    }
};

// Simulation State
let handedness = 'right';
let initialRot = quat.fromValues(0, 0, 0, 1); // Identity
let currentRot = quat.create();

// 1. Initialize (First Frame)
console.log("--- Frame 1: Grip Start ---");
let rotation = initialRot;
let gState = context._vrGrip[handedness];
let origin = vec3.fromValues(0, 0, 0);

if (!gState.active) {
    gState.active = true;
    vec3.copy(gState.startPoint, origin);
    quat.copy(gState.startRot, rotation); // Store Initial
    console.log(`Initialized startRot: ${gState.startRot}`);
}

// 2. Rotate Hand 90 Degrees around Y (Second Frame)
console.log("\n--- Frame 2: Hand Rotated 90 deg Y ---");
quat.setAxisAngle(currentRot, [0, 1, 0], Math.PI / 2); // 90 deg Y
rotation = currentRot;

if (rotation) {
    const qDelta = quat.create();
    const qInv = quat.create();
    
    // Logic from Scene.js
    quat.invert(qInv, gState.startRot);
    quat.multiply(qDelta, rotation, qInv); // Current * InvStart = Delta

    console.log(`Current Rot: ${rotation}`);
    console.log(`Start Rot Inv: ${qInv}`);
    console.log(`Calculated Delta: ${qDelta}`);
    console.log(`Delta Axis/Angle: ${2 * Math.acos(qDelta[3]) * (180/Math.PI)} deg`);

    // Threshold Check
    // Threshold: 0.000001
    // For 90 deg, w should be cos(45) = 0.707
    // 0.707 - 1.0 = -0.293. Abs > 0.000001. Should pass.
    if (Math.abs(qDelta[3] - 1.0) > 0.000001) {
        context.rotateWorld(qDelta, origin);
        quat.copy(gState.startRot, rotation); // Update Start
    } else {
        console.log("Threshold not met.");
    }
}

// 3. Small Jitter (Third Frame)
console.log("\n--- Frame 3: Small Jitter (0.001 deg) ---");
// Rotate slightly from current
let jitterRot = quat.create();
quat.setAxisAngle(jitterRot, [0, 1, 0], 0.00001); // Tiny angle
quat.multiply(rotation, jitterRot, currentRot); // Apply jitter to previous

if (rotation) {
    const qDelta = quat.create();
    const qInv = quat.create();
    
    quat.invert(qInv, gState.startRot);
    quat.multiply(qDelta, rotation, qInv); 

    console.log(`Jitter Delta: ${qDelta}`);
    console.log(`Jitter w: ${qDelta[3]}`);
    console.log(`Diff from 1.0: ${Math.abs(qDelta[3] - 1.0)}`);

    if (Math.abs(qDelta[3] - 1.0) > 0.000001) {
         context.rotateWorld(qDelta, origin);
          quat.copy(gState.startRot, rotation);
    } else {
        console.log("Jitter suppressed (Threshold worked).");
    }
}
