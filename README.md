# Ruyi Actions

GitHub Actions for installing the RuyiSDK package manager and creating Ruyi virtual environments in CI.

These actions are designed for Linux runners, which is the primary supported platform for RuyiSDK binary packages.

## Quick start

Use `setup-ruyi` to install the package manager, then use `setup-ruyi-venv` to install a toolchain and create a Ruyi virtual environment. The venv action adds the environment's `bin` directory to `PATH` and exports toolchain file paths for later steps.

```yaml
name: Ruyi CI

on:
  push:
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: ruyisdk/ruyi-actions/setup-ruyi@v1

      - uses: ruyisdk/ruyi-actions/setup-ruyi-venv@v1
        with:
          profile: generic
          toolchain: gnu-plct
          path: .ruyi-venv

      - run: |
          cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE="$RUYI_CMAKE_TOOLCHAIN_FILE"
          cmake --build build
```

For Meson projects, use the exported cross file:

```yaml
- run: |
    meson setup build --cross-file "$RUYI_MESON_CROSS_FILE"
    meson compile -C build
```

A complete self-test workflow is available at `.github/workflows/demo-cmake.yml`, using the sample project in `examples/cmake-hello-riscv`.

## Reference

### `setup-ruyi`

Installs `ruyi`, adds it to `PATH`, restores Ruyi caches, configures repositories, and optionally runs `ruyi update`.

```yaml
steps:
  - uses: ruyisdk/ruyi-actions/setup-ruyi@v1
    with:
      version: "0.49.0-alpha.20260422"
      update: "true"
```

Useful inputs:

| Input | Default | Description |
| --- | --- | --- |
| `setup-python` | `true` | Run `actions/setup-python` before installing Ruyi. |
| `python-version` | `3.x` | Python version passed to `actions/setup-python` when `setup-python` is `true`. |
| `version` | empty | Ruyi version to install from PyPI. |
| `install-spec` | empty | Full pip requirement specifier. Overrides `version`. |
| `pip-extra-args` | empty | Extra arguments passed to `pip install`. |
| `cache` | `true` | Restore and save Ruyi cache, data, and state directories. |
| `cache-version` | `v1` | Manual cache namespace bump. |
| `update` | `true` | Run `ruyi update`. |
| `repo-remote` | empty | Override `repo.remote`. |
| `repo-branch` | empty | Override `repo.branch`. |
| `repo-local` | empty | Override `repo.local`. Must be absolute. |
| `extra-config` | empty | Extra TOML appended to `~/.config/ruyi/config.toml`. |
| `telemetry` | `off` | Ruyi telemetry mode: `off`, `local`, or `on`. |

Useful outputs:

| Output | Description |
| --- | --- |
| `ruyi-bin` | Absolute path to the installed `ruyi` executable. |
| `ruyi-version` | Installed Ruyi version. |
| `python-venv` | Python virtual environment used to install Ruyi. |
| `config-root` | Ruyi config root. |
| `cache-root` | Ruyi cache root. |
| `data-root` | Ruyi data root. |
| `state-root` | Ruyi state root. |

If your workflow already configures Python, disable the built-in Python setup:

```yaml
steps:
  - uses: actions/setup-python@v5
    with:
      python-version: "3.12"

  - uses: ruyisdk/ruyi-actions/setup-ruyi@v1
    with:
      setup-python: "false"
```

### `setup-ruyi-venv`

Installs requested Ruyi packages and creates a Ruyi virtual environment. This action expects `ruyi` to already be available on `PATH`, so it is normally used after `setup-ruyi`.

```yaml
steps:
  - uses: ruyisdk/ruyi-actions/setup-ruyi@v1

  - uses: ruyisdk/ruyi-actions/setup-ruyi-venv@v1
    with:
      profile: generic
      toolchain: gnu-plct
      path: .ruyi-venv

  - run: |
      cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE="$RUYI_CMAKE_TOOLCHAIN_FILE"
      cmake --build build
```

Useful inputs:

| Input | Default | Description |
| --- | --- | --- |
| `profile` | required | Ruyi profile used to create the virtual environment. |
| `path` | `.ruyi-venv` | Destination path for the virtual environment. |
| `name` | empty | Optional display name for the virtual environment. |
| `toolchain` | required | Toolchain atom or newline/comma-separated atoms. |
| `emulator` | empty | Optional emulator atom. |
| `extra-commands` | empty | Newline/comma-separated package atoms that provide extra commands. |
| `with-sysroot` | `true` | Provision a sysroot inside the virtual environment. |
| `sysroot-package` | empty | Package atom to use as sysroot source. |
| `copy-sysroot-from-dir` | empty | Directory to copy as the sysroot. |
| `symlink-sysroot-from-dir` | empty | Directory to symlink as the sysroot. |
| `install` | `true` | Install referenced packages before creating the virtual environment. |
| `reinstall` | `false` | Pass `--reinstall` to `ruyi install`. |
| `force` | `false` | Remove an existing virtual environment at `path` before creating it. |

Useful outputs and environment variables:

| Name | Kind | Description |
| --- | --- | --- |
| `venv-path` | output | Absolute path to the virtual environment. |
| `bin-path` | output | Virtual environment `bin` directory. |
| `cmake-toolchain-file` | output | CMake toolchain file path. |
| `meson-cross-file` | output | Meson cross file path. |
| `sysroot` | output | Primary sysroot path, when provisioned. |
| `RUYI_VENV` | env | Absolute path to the virtual environment. |
| `RUYI_CMAKE_TOOLCHAIN_FILE` | env | CMake toolchain file path. |
| `RUYI_MESON_CROSS_FILE` | env | Meson cross file path. |
| `RUYI_SYSROOT` | env | Primary sysroot path, when provisioned. |

## Multi-repo configuration

Use `extra-config` to append additional Ruyi repository configuration.

```yaml
- uses: ruyisdk/ruyi-actions/setup-ruyi@v1
  with:
    extra-config: |
      [[repos]]
      id = "overlay"
      name = "Overlay"
      remote = "https://example.com/ruyi-overlay.git"
      branch = "main"
      priority = 100
      active = true
```
