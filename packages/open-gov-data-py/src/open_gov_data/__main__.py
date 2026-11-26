"""Allow ``python -m open_gov_data``."""

from .cli import main


if __name__ == "__main__":
    raise SystemExit(main())
