from pathlib import Path

from setuptools import find_packages, setup


ROOT = Path(__file__).parent


setup(
    name="lawftune",
    version="0.1.0",
    description="lawftune command line interface",
    long_description=(ROOT / "README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    author="longsiyu",
    license="MIT",
    python_requires=">=3.10",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    include_package_data=True,
    package_data={
        "lawftune": [
            "_frontend/index.html",
            "_frontend/assets/*",
        ]
    },
    extras_require={
        "server": [
            "fastapi",
            "httpx",
            "PyYAML",
            "python-multipart",
            "uvicorn",
        ]
    },
    entry_points={
        "console_scripts": [
            "lawftune=lawftune.cli:main",
        ]
    },
)
