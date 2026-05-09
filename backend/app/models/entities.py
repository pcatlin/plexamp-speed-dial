from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text, func

from app.db.database import Base


class PlexCredential(Base):
    __tablename__ = "plex_credentials"

    id = Column(Integer, primary_key=True, index=True)
    auth_token = Column(Text, nullable=True)
    username = Column(String(255), nullable=True)
    is_connected = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now(), nullable=False)


class PlexampPlayer(Base):
    __tablename__ = "plexamp_players"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    host = Column(String(255), nullable=False)
    port = Column(Integer, nullable=False, default=32500)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SonosGroupPreset(Base):
    __tablename__ = "sonos_group_presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    speaker_ids = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SpeedDialFavorite(Base):
    __tablename__ = "speed_dial_favorites"

    id = Column(Integer, primary_key=True, index=True)
    label = Column(String(255), nullable=False)
    media_type = Column(String(50), nullable=False)
    media_id = Column(String(255), nullable=False)
    player_id = Column(Integer, nullable=False)
    speaker_ids = Column(JSON, nullable=False, default=list)
    preset_id = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
