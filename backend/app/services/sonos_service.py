from soco import discover

from app.schemas.domain import SonosSpeaker


class SonosService:
    def list_speakers(self) -> list[SonosSpeaker]:
        speakers = discover(timeout=1) or set()
        if not speakers:
            return [
                SonosSpeaker(id="demo-living-room", name="Living Room", ip="192.168.1.10"),
                SonosSpeaker(id="demo-kitchen", name="Kitchen", ip="192.168.1.11"),
            ]

        return [
            SonosSpeaker(id=speaker.uid, name=speaker.player_name, ip=speaker.ip_address)
            for speaker in speakers
        ]
