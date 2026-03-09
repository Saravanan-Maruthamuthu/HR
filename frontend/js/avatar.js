// avatar.js - Three.js setup for loading and animating 3D Avatar

window.AvatarPlayer = (() => {
    let scene, camera, renderer, clock;
    let avatarModel, mixer;
    let jawBone = null;
    let mouthMorphTargets = [];

    // Animation frame request ID
    let reqId = null;

    // We'll manage a "mouth openness" value 0.0 - 1.0
    let currentMouthOpenness = 0;
    let targetMouthOpenness = 0;

    function init() {
        const container = document.getElementById('ai-avatar-container');
        if (!container) return;

        // Scene
        scene = new THREE.Scene();

        // Camera
        camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
        camera.position.set(0, 1.5, 3); // Positioned to look at face

        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.outputEncoding = THREE.sRGBEncoding;

        // Remove old canvas if any, append new
        while (container.firstChild) {
            container.removeChild(container.firstChild);
        }
        container.appendChild(renderer.domElement);

        // Lights
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
        hemiLight.position.set(0, 20, 0);
        scene.add(hemiLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(3, 10, 10);
        scene.add(dirLight);

        // Load Avatar
        const loader = new THREE.GLTFLoader();
        loader.load('models/avatar.glb', (gltf) => {
            avatarModel = gltf.scene;

            // Auto-scale generic models to fit in our camera view appropriately
            const box = new THREE.Box3().setFromObject(avatarModel);
            const size = box.getSize(new THREE.Vector3()).length();
            const center = box.getCenter(new THREE.Vector3());

            const targetSize = 2.5; // Fixed size to fit the frame
            const scale = targetSize / size;
            avatarModel.scale.set(scale, scale, scale);

            // Center it horizontally, but position vertically so head is near y=1.5
            avatarModel.position.x = -center.x * scale;
            avatarModel.position.y = (-center.y * scale) + 1.2;
            avatarModel.position.z = -center.z * scale;

            scene.add(avatarModel);

            // Setup morph targets for mouth (ReadyPlayerMe uses standard names)
            avatarModel.traverse((child) => {
                if (child.isMesh && child.morphTargetDictionary) {
                    const dict = child.morphTargetDictionary;
                    // Common mouth-opening morphs loosely matching different formats:
                    const mouthKeys = [
                        'mouthOpen', 'jawOpen', 'viseme_O', 'viseme_aa',
                        'Mouth_Open', 'Jaw_Open'
                    ];
                    mouthKeys.forEach(k => {
                        if (dict[k] !== undefined) {
                            mouthMorphTargets.push({ mesh: child, index: dict[k] });
                        }
                    });
                }
                if (child.isBone && child.name.toLowerCase().includes('jaw')) {
                    jawBone = child;
                }
            });

            // If we have an avatar, ensure camera points directly at it
            camera.position.set(0, 1.2, 4.0);
            camera.lookAt(0, 1.2, 0);

            // Start animation loop
            clock = new THREE.Clock();
            animate();
        }, undefined, (error) => {
            console.warn('Could not load models/avatar.glb. Creating a procedural fallback avatar...', error);
            createFallbackAvatar();
        });

        // Handle resize
        window.addEventListener('resize', onWindowResize, false);
    }

    function createFallbackAvatar() {
        // Create a simple procedural head (sphere)
        const headGeo = new THREE.SphereGeometry(1.5, 32, 32);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x44aa88, roughness: 0.5 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.0;

        // Create eyes
        const eyeGeo = new THREE.SphereGeometry(0.2, 16, 16);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.6, 0.4, 1.3);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.6, 0.4, 1.3);
        head.add(leftEye);
        head.add(rightEye);

        // Create a jaw
        const jawGeo = new THREE.BoxGeometry(1.2, 0.6, 1.2);
        const jawMat = new THREE.MeshStandardMaterial({ color: 0x338866, roughness: 0.5 });
        const jaw = new THREE.Mesh(jawGeo, jawMat);

        // We want the jaw to pivot from the back
        jawGeo.translate(0, -0.3, 0.3);
        jaw.position.set(0, -0.6, 0.6);

        head.add(jaw);
        scene.add(head);

        jawBone = jaw; // Use the jaw for rotation fallback

        // Ensure camera is looking exactly at this head
        camera.position.set(0, 1.0, 5.0);
        camera.lookAt(0, 1.0, 0);

        // Start animation loop if not started
        if (!clock) {
            clock = new THREE.Clock();
            animate();
        }
    }

    function onWindowResize() {
        const container = document.getElementById('ai-avatar-container');
        if (!container || !camera || !renderer) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function animate() {
        reqId = requestAnimationFrame(animate);
        const delta = clock.getDelta();

        // Smoothly interpolate mouth to target openness
        currentMouthOpenness += (targetMouthOpenness - currentMouthOpenness) * 15 * delta;

        // Apply to morph targets
        mouthMorphTargets.forEach(target => {
            target.mesh.morphTargetInfluences[target.index] = currentMouthOpenness;
        });

        // Fallback if no morph targets (rotate jaw bone)
        if (mouthMorphTargets.length === 0 && jawBone) {
            jawBone.rotation.x = currentMouthOpenness * 0.3; // tweak rotation angle
        }

        if (mixer) mixer.update(delta);
        renderer.render(scene, camera);
    }

    // Call this from SpeechSynthesis or Audio analyzer to drive lip sync
    function setMouthOpenness(val) {
        targetMouthOpenness = Math.max(0, Math.min(1, val));
    }

    // Simple procedural talk animation: call this in a tick loop while speaking
    function startProceduralLipSync() {
        const t = performance.now() * 0.01;
        // Generate pseudo-random mouth flapping
        const v = (Math.sin(t) * 0.5 + 0.5) * (Math.sin(t * 1.3) * 0.5 + 0.5);
        setMouthOpenness(v * 0.8 + 0.1);
    }

    function stopLipSync() {
        setMouthOpenness(0);
    }

    return { init, setMouthOpenness, startProceduralLipSync, stopLipSync };
})();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only init if the container is present
    if (document.getElementById('ai-avatar-container')) {
        window.AvatarPlayer.init();
    }
});
