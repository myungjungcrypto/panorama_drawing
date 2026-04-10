'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface DentalArchModelProps {
  isUpper: boolean;
}

export default function DentalArchModel({ isUpper }: DentalArchModelProps) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      '/models/teeth_base.glb',
      (gltf) => {
        if (!groupRef.current) return;

        // Clear previous
        while (groupRef.current.children.length > 0) {
          groupRef.current.remove(groupRef.current.children[0]);
        }

        const model = gltf.scene.clone();

        // Get bounding box for scaling
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale to match our arch (~6 units wide)
        const scaleFactor = 6.0 / size.x;
        model.scale.setScalar(scaleFactor);

        // Center the model
        const scaledCenter = center.clone().multiplyScalar(scaleFactor);
        model.position.x = -scaledCenter.x;
        model.position.z = -scaledCenter.z;

        // Rotate to face front (model might be oriented differently)
        model.rotation.x = -Math.PI / 2; // rotate to stand upright

        // Position based on upper/lower
        model.position.y = isUpper ? 0.8 : -0.8;

        // Clip: show only upper or lower half using clipping planes
        const clipY = isUpper ? -0.1 : 0.1;

        // Apply tooth-colored material
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            // Skip debris parts (very small or far away meshes)
            const meshBox = new THREE.Box3().setFromObject(mesh);
            const meshSize = meshBox.getSize(new THREE.Vector3());
            if (meshSize.length() < 0.01) return;

            mesh.material = new THREE.MeshPhysicalMaterial({
              color: '#ede8d0',
              roughness: 0.22,
              metalness: 0.02,
              clearcoat: 0.4,
              clearcoatRoughness: 0.15,
              side: THREE.DoubleSide,
            });
          }
        });

        groupRef.current.add(model);
      },
      undefined,
      (err) => {
        console.warn('치아 모델 로드 실패:', err);
      }
    );
  }, [isUpper]);

  return <group ref={groupRef} />;
}
