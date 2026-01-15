package models

// MapLayout represents the entire conveyor layout.
type MapLayout struct {
	Version string               `json:"version" xml:"version,attr"`
	Objects map[string]MapObject `json:"objects"`
}

// MapObject represents a single component in the layout (Belt, Diverter, Port, etc.).
// Fields are based on the attributes and child elements extracted by the reference implementation.
type MapObject struct {
	Name          string `json:"name"`
	Type          string `json:"type"`          // Class name in XML
	Text          string `json:"text"`          // Display text
	Size          string `json:"size"`          // "width, height"
	Location      string `json:"location"`      // "x, y"
	UnitId        string `json:"unitId"`        // PLC Unit ID
	LineThick     string `json:"lineThick"`     // For arrows/lines
	FlowDirection string `json:"flowDirection"` // "Angle_90", etc.
	ForeColor     string `json:"foreColor"`     // Color name or hex
	EndCap        string `json:"endCap"`        // For arrows
	StartCap      string `json:"startCap"`      // For arrows
	DashStyle     string `json:"dashStyle"`     // For lines
}
