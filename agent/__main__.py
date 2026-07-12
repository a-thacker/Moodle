"""Allows `python -m agent <command>`."""

import sys

from .main import main

sys.exit(main())
