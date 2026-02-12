from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator


@dataclass
class RangeResult:
    start: int
    end: int
    length: int


def parse_range(range_header: str | None, file_size: int) -> RangeResult | None:
    if not range_header:
        return None
    if not range_header.startswith("bytes="):
        return None
    range_spec = range_header.replace("bytes=", "")
    start_str, end_str = range_spec.split("-")
    start = int(start_str) if start_str else None
    end = int(end_str) if end_str else None

    if start is None:
        # suffix length
        length = end or 0
        start = max(file_size - length, 0)
        end = file_size - 1
    elif end is None:
        end = file_size - 1

    if start < 0 or end >= file_size or start > end:
        return None

    return RangeResult(start=start, end=end, length=end - start + 1)


def file_iterator(path: str, start: int, length: int, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    with open(path, "rb") as handle:
        handle.seek(start)
        remaining = length
        while remaining > 0:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
