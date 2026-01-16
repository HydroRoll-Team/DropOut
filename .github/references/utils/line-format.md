# Line reference format based on RFC 5147

When referencing specific lines in a file, use the following format:

```text
path/to/file.ext:startLineNum-endLineNum
```

Where `startLineNum` and `endLineNum` are the line numbers in the file, inclusive. Additionally, if referencing a single line, you can omit the `endLineNum`:

```text
path/to/file.ext:lineNum
```

For **all** paths(including those on windows), use forward slashes (`/`) as directory separators and should be the raw relative path from the **repository root**. Also, line numbers are **1-based** (the first line of the file is line 1).
