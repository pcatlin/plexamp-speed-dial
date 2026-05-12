from app.db.database import Base, engine
from app.models import PlexCredential, PlexampPlayer, RuntimeSetup, SonosGroupPreset, SpeedDialFavorite


def run() -> None:
    _ = (PlexCredential, PlexampPlayer, RuntimeSetup, SonosGroupPreset, SpeedDialFavorite)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    run()
