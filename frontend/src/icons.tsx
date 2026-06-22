type FaIconProps = {
  icon: string;
  className?: string;
};

function FaIcon({ icon, className = "mediaCtrlIcon" }: FaIconProps) {
  return <i className={`fa-solid ${icon} ${className}`.trim()} aria-hidden />;
}

export function IconPlay() {
  return <FaIcon icon="fa-play" />;
}

export function IconStop() {
  return <FaIcon icon="fa-stop" />;
}

export function IconPause() {
  return <FaIcon icon="fa-pause" />;
}

export function IconSkipPrevious() {
  return <FaIcon icon="fa-backward-step" />;
}

export function IconSkipNext() {
  return <FaIcon icon="fa-forward-step" />;
}

export function IconVolumeDown() {
  return <FaIcon icon="fa-volume-low" />;
}

export function IconVolumeUp() {
  return <FaIcon icon="fa-volume-high" />;
}

export function IconChevronDown() {
  return <FaIcon icon="fa-chevron-down" className="playToChevron" />;
}

export function IconShuffle() {
  return <FaIcon icon="fa-shuffle" />;
}

export function IconPowerOff() {
  return <FaIcon icon="fa-power-off" />;
}

export function IconLaunchApp() {
  return <FaIcon icon="fa-arrow-up-right-from-square" />;
}
