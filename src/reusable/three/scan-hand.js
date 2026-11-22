const FLEX = {
  index: [-.37, -.72, -.40],
  middle: [-.46, -.82, -.43],
  ring: [-.54, -.86, -.43],
  pinky: [-.61, -.89, -.45],
  thumb: [-.24, -.30, -.10]
};

export async function createScanHand(THREE, loader) {
  const { scene } = await loader.loadAsync(new URL('../../assets/models/scan-hand.glb', import.meta.url).href);
  const group = new THREE.Group();
  const hand = new THREE.Group();
  // The asset's bind pose is in meters. Put the wrist at the origin and point the fingers along +X.
  hand.matrixAutoUpdate = false;
  hand.matrix.set(
    0, 0, -100, -2.47,
    100, 0, 0, -2.4,
    0, 100, 0, -5.3,
    0, 0, 0, 1
  );
  hand.add(scene);
  group.add(hand);

  const skin = scene.getObjectByProperty('isSkinnedMesh', true);
  skin.material.roughness = .57;
  // The relaxed pose's bounding sphere does not account for bone movement during the grab.
  skin.frustumCulled = false;

  const sleeveProfile = [
    [4.0, -21], [4.0, -15], [3.69, -9], [3.46, -4], [3.43, -1.5],
    [3.51, -1.25], [3.51, .43], [3.43, .65], [0, .65]
  ].map(([radius, x]) => new THREE.Vector2(radius, x));
  const sleeve = new THREE.Mesh(
    new THREE.LatheGeometry(sleeveProfile, 32),
    new THREE.MeshStandardMaterial({ color: 0x333a37, roughness: .94 })
  );
  sleeve.rotation.z = -Math.PI / 2;
  sleeve.position.y = .35;
  sleeve.scale.z = .76;
  group.add(sleeve);

  const joints = Object.entries(FLEX).flatMap(([finger, angles]) => angles.map((angle, i) => {
    const bone = scene.getObjectByName(`${finger}_0${i + 1}_r`);
    return { bone, rest: bone.quaternion.clone(), angle, opposition: finger === 'thumb' && i === 0 ? .85 : 0 };
  }));
  const axisZ = new THREE.Vector3(0, 0, 1);
  const axisX = new THREE.Vector3(1, 0, 0);
  const bend = new THREE.Quaternion();
  let previous;

  function grip(amount) {
    const pose = THREE.MathUtils.clamp(amount, 0, 1);
    if (pose === previous) return;
    previous = pose;
    for (const { bone, rest, angle, opposition } of joints) {
      bone.quaternion.copy(rest);
      if (opposition) bone.quaternion.multiply(bend.setFromAxisAngle(axisX, pose * opposition));
      bone.quaternion.multiply(bend.setFromAxisAngle(axisZ, pose * angle));
    }
  }

  return { group, grip };
}
