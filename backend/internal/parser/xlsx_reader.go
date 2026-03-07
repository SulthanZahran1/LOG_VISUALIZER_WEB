package parser

import (
	"archive/zip"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
)

// isXLSXFile returns true if the file starts with the ZIP magic bytes (PK\x03\x04),
// which is the signature for xlsx (and other OOXML) files.
// This works even when the file has no extension (e.g. uploaded as a UUID).
func isXLSXFile(filePath string) bool {
	f, err := os.Open(filePath)
	if err != nil {
		return false
	}
	defer f.Close()
	var sig [4]byte
	if _, err := io.ReadFull(f, sig[:]); err != nil {
		return false
	}
	return sig[0] == 0x50 && sig[1] == 0x4B && sig[2] == 0x03 && sig[3] == 0x04
}

// xlsxRows reads all rows from an xlsx file as string slices.
// Row 0 is the header row.
func xlsxRows(filePath string) ([][]string, error) {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, fmt.Errorf("open xlsx: %w", err)
	}
	defer zr.Close()

	ss, err := xlsxLoadSharedStrings(zr)
	if err != nil {
		return nil, err
	}

	var sheetFile *zip.File
	for _, f := range zr.File {
		if f.Name == "xl/worksheets/sheet1.xml" {
			sheetFile = f
			break
		}
	}
	if sheetFile == nil {
		return nil, fmt.Errorf("sheet1.xml not found in xlsx")
	}

	rc, err := sheetFile.Open()
	if err != nil {
		return nil, fmt.Errorf("open sheet1.xml: %w", err)
	}
	defer rc.Close()

	return xlsxParseSheet(rc, ss)
}

func xlsxLoadSharedStrings(zr *zip.ReadCloser) ([]string, error) {
	for _, f := range zr.File {
		if f.Name == "xl/sharedStrings.xml" {
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			defer rc.Close()
			return xlsxParseSharedStrings(rc)
		}
	}
	return nil, nil
}

func xlsxParseSharedStrings(r io.Reader) ([]string, error) {
	var result []string
	dec := xml.NewDecoder(r)
	inSI := false
	inT := false
	var cur strings.Builder

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("parse sharedStrings: %w", err)
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "si":
				inSI = true
				cur.Reset()
			case "t":
				if inSI {
					inT = true
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "si":
				result = append(result, cur.String())
				inSI = false
				inT = false
			case "t":
				inT = false
			}
		case xml.CharData:
			if inT && inSI {
				cur.Write(t)
			}
		}
	}
	return result, nil
}

func xlsxParseSheet(r io.Reader, ss []string) ([][]string, error) {
	dec := xml.NewDecoder(r)
	var rows [][]string
	var currentRow []string
	maxCol := 0
	inSheetData := false
	inRow := false
	inCell := false
	inValue := false
	cellType := ""
	cellCol := 0
	var cellValBuf strings.Builder

	for {
		tok, err := dec.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "sheetData":
				inSheetData = true
			case "row":
				if inSheetData {
					inRow = true
					currentRow = currentRow[:0]
				}
			case "c":
				if inRow {
					inCell = true
					cellType = ""
					cellCol = 0
					cellValBuf.Reset()
					for _, attr := range t.Attr {
						switch attr.Name.Local {
						case "r":
							cellCol = xlsxColIndex(xlsxCellColLetters(attr.Value))
						case "t":
							cellType = attr.Value
						}
					}
				}
			case "v":
				if inCell {
					inValue = true
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "sheetData":
				inSheetData = false
			case "row":
				if inRow {
					rows = append(rows, append([]string(nil), currentRow...))
					if len(currentRow) > maxCol {
						maxCol = len(currentRow)
					}
					inRow = false
				}
			case "c":
				if inCell {
					raw := cellValBuf.String()
					val := raw
					if cellType == "s" {
						if idx, err := strconv.Atoi(raw); err == nil && idx >= 0 && idx < len(ss) {
							val = ss[idx]
						}
					}
					for len(currentRow) <= cellCol {
						currentRow = append(currentRow, "")
					}
					currentRow[cellCol] = val
					inCell = false
					inValue = false
				}
			case "v":
				inValue = false
			}
		case xml.CharData:
			if inValue {
				cellValBuf.Write(t)
			}
		}
	}

	// Normalize all rows to same length
	for i := range rows {
		for len(rows[i]) < maxCol {
			rows[i] = append(rows[i], "")
		}
	}

	return rows, nil
}

// xlsxCellColLetters extracts the column letters from a cell reference (e.g. "A1" -> "A", "AA25" -> "AA").
func xlsxCellColLetters(ref string) string {
	i := 0
	for i < len(ref) && ref[i] >= 'A' && ref[i] <= 'Z' {
		i++
	}
	return ref[:i]
}

// xlsxColIndex converts column letters to a 0-based column index (A=0, B=1, ..., Z=25, AA=26, ...).
func xlsxColIndex(col string) int {
	result := 0
	for i := 0; i < len(col); i++ {
		result = result*26 + int(col[i]-'A'+1)
	}
	return result - 1
}
