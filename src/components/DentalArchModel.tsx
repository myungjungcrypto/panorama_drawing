'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';
import { useLoader } from '@react-three/fiber';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

interface DentalArchModelProps {
  isUpper: boolean;
}

export default function DentalArchModel({ isUpper }: DentalArchModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const [loaded, setLoaded] = useState(false);

  const url = isUpper
    ? '/models/dental_arch_upper.glb'
    : '/models/dental_arch_lower.glb';

  useEffect(() => {
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (!groupRef.current) return;

        // Clear previous
        while (groupRef.current.children.length > 0) {
          groupRef.current.remove(groupRef.current.children[0]);
        }

        const model = gltf.scene.clone();

        // Auto-scale to fit our scene
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Scale to ~5.5 units wide (match arch geometry)
        const targetWidth = 5.5;
        const scaleFactor = targetWidth / Math.max(size.x, size.z);
        model.scale.setScalar(scaleFactor);

        // Center horizontally
        const scaledCenter = center.multiplyScalar(scaleFactor);
        model.position.x = -scaledCenter.x;
        model.position.z = -scaledCenter.z + 1.5; // offset to match arch curve center

        // Vertical position
        model.position.y = isUpper ? 0.5 : -0.5;

        // Apply material
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = new THREE.MeshPhysicalMaterial({
              color: '#ede8d0',
              roughness: 0.25,
              metalness: 0.02,
              clearcoat: 0.3,
              clearcoatRoughness: 0.2,
            });
          }
        });

        groupRef.current.add(model);
        setLoaded(true);
      },
      undefined,
      (err) => {
        console.warn(`GLB 모델 로드 실패 (${url}):`, err);
      }
    );
  }, [url, isUpper]);

  return <group ref={groupRef} />;
}
