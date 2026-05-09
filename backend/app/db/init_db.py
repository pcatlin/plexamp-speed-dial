from app.db.database import Base, engine
from app.models import PlexCredential, PlexampPlayer, SonosGroupPreset, SpeedDialFavorite


def run() -> None:
    _ = (PlexCredential, PlexampPlayer, SonosGroupPreset, SpeedDialFavorite)
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    run()
