package parser

import (
	"encoding/xml"
	"io"
	"os"

	"github.com/plc-visualizer/backend/internal/models"
)

// MapXML represents the raw XML structure of the conveyor map.
type MapXML struct {
	XMLName xml.Name        `xml:"ConveyorMap"`
	Version string          `xml:"version,attr"`
	Objects []ObjectElement `xml:"Object"`
}

type ObjectElement struct {
	Name string `xml:"name,attr"`
	Type string `xml:"type,attr"`
	// Use innerXML or list of fields to stay close to reference logic
	Text          string `xml:"Text"`
	Size          string `xml:"Size"`
	Location      string `xml:"Location"`
	UnitId        string `xml:"UnitId"`
	LineThick     string `xml:"LineThick"`
	FlowDirection string `xml:"FlowDirection"`
	ForeColor     string `xml:"ForeColor"`
	EndCap        string `xml:"EndCap"`
	StartCap      string `xml:"StartCap"`
	DashStyle     string `xml:"DashStyle"`
}

// ParseMapXML parses a conveyor map XML file.
func ParseMapXML(filePath string) (*models.MapLayout, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		return nil, err
	}

	var raw MapXML
	if err := xml.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	layout := &models.MapLayout{
		Version: raw.Version,
		Objects: make(map[string]models.MapObject),
	}

	for _, obj := range raw.Objects {
		layout.Objects[obj.Name] = models.MapObject{
			Name:          obj.Name,
			Type:          obj.Type,
			Text:          obj.Text,
			Size:          obj.Size,
			Location:      obj.Location,
			UnitId:        obj.UnitId,
			LineThick:     obj.LineThick,
			FlowDirection: obj.FlowDirection,
			ForeColor:     obj.ForeColor,
			EndCap:        obj.EndCap,
			StartCap:      obj.StartCap,
			DashStyle:     obj.DashStyle,
		}
	}

	return layout, nil
}
