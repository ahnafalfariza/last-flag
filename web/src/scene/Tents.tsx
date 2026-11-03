import { accountColor, useGame } from '../game/store';
import { TENT_Y, tentSpots } from './tags';

/** One tent per camper, on the lowest terrace. Staked principal lives here. */
export function Tents() {
  const round = useGame((s) => s.round);
  return (
    <group>
      {tentSpots(round).map((c) => {
        const col = accountColor(c.account);
        return (
          <group key={c.account} position={[c.x, TENT_Y, c.z]} rotation={[0, -c.angle + Math.PI / 2, 0]}>
            <mesh position={[0, 0.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow receiveShadow>
              <coneGeometry args={[1.25, 1.4, 4]} />
              <meshStandardMaterial color={col} flatShading roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
              <circleGeometry args={[1.45, 4]} />
              <meshStandardMaterial color="#6f5d3f" />
            </mesh>
            <mesh position={[0, 0.4, 0.62]}>
              <coneGeometry args={[0.36, 0.75, 3]} />
              <meshStandardMaterial color="#1e1a16" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
