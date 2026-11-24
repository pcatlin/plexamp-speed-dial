type Props = {
  title: string;
  subtitle?: string | null;
  artUrl: string;
};

/** Selected playlist / album / artist / track preview (cover + name). */
export function PickedMediaPreview({ title, subtitle, artUrl }: Props) {
  return (
    <div className="pickedArtWrap">
      <img className="pickedArt" src={artUrl} alt="" loading="lazy" decoding="async" />
      <div className="pickedArtMeta">
        <div className="pickedArtTitle">{title}</div>
        {subtitle ? <div className="pickedArtSub">{subtitle}</div> : null}
      </div>
    </div>
  );
}
