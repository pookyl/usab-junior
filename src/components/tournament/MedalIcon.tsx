import fourthPlaceMedalIcon from '../../assets/icons/fourth-place-medal.png';

export type MedalPlace = 'gold' | 'silver' | 'bronze' | 'fourth';

const EMOJI: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export default function MedalIcon({ place, size = 22 }: { place: MedalPlace; size?: number }) {
  const iconBox = { width: size, height: size };

  if (place === 'fourth') {
    return (
      <span className="inline-flex items-center justify-center shrink-0" style={iconBox}>
        <img
          src={fourthPlaceMedalIcon}
          alt="4th place medal"
          className="block w-full h-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center shrink-0 leading-none" style={iconBox}>
      <span style={{ fontSize: size }}>{EMOJI[place]}</span>
    </span>
  );
}
