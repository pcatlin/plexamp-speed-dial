from pathlib import Path

import yaml

from app.main import app


if __name__ == "__main__":
    output = Path(__file__).resolve().parents[1] / "openapi.yaml"
    with output.open("w", encoding="utf-8") as file:
        yaml.safe_dump(app.openapi(), file, sort_keys=False)
    print(f"OpenAPI exported to {output}")
