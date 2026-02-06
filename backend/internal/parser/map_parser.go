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

// AlternativeMapXML supports MapLayout as root
type AlternativeMapXML struct {
	XMLName xml.Name        `xml:"MapLayout"`
	Version string          `xml:"version,attr"`
	Objects []ObjectElement `xml:"Objects>Object"`
}

// MapXMLRoot supports Map as root
type MapXMLRoot struct {
	XMLName xml.Name        `xml:"Map"`
	Version string          `xml:"version,attr"`
	Objects []ObjectElement `xml:"Object"`
}

// ObjectXMLRoot supports Object as root (Common in .NET serialized layouts)
type ObjectXMLRoot struct {
	XMLName xml.Name        `xml:"Object"`
	Version string          `xml:"version,attr"`
	Objects []ObjectElement `xml:"Object"`
}

// LayoutDesignerRoot supports LayoutDesignerControl as root (.NET WinForms layout files)
type LayoutDesignerRoot struct {
	XMLName xml.Name        `xml:"Object"`
	Type    string          `xml:"type,attr"`
	Name    string          `xml:"name,attr"`
	Objects []ObjectElement `xml:"Object"`
}

type ObjectElement struct {
	Name          string `xml:"name,attr"`
	NameUpper     string `xml:"Name,attr"`
	Type          string `xml:"type,attr"`
	TypeUpper     string `xml:"Type,attr"`
	Text          string `xml:"text,attr"`
	TextUpper     string `xml:"Text,attr"`
	Size          string `xml:"size,attr"`
	SizeUpper     string `xml:"Size,attr"`
	Location      string `xml:"location,attr"`
	LocationUpper string `xml:"Location,attr"`
	UnitId        string `xml:"unitId,attr"`
	UnitIdUpper   string `xml:"UnitId,attr"`
	UnitID        string `xml:"UnitID,attr"`

	// Individual coordinates
	X      string `xml:"x,attr"`
	XUpper string `xml:"X,attr"`
	Y      string `xml:"y,attr"`
	YUpper string `xml:"Y,attr"`
	W      string `xml:"width,attr"`
	WUpper string `xml:"Width,attr"`
	H      string `xml:"height,attr"`
	HUpper string `xml:"Height,attr"`

	LineThick     string `xml:"lineThick,attr"`
	FlowDirection string `xml:"flowDirection,attr"`
	ForeColor     string `xml:"foreColor,attr"`
	EndCap        string `xml:"endCap,attr"`
	StartCap      string `xml:"startCap,attr"`
	DashStyle     string `xml:"dashStyle,attr"`

	// Element-based fallback
	TextChild          string `xml:"Text"`
	SizeChild          string `xml:"Size"`
	LocationChild      string `xml:"Location"`
	UnitIdChild        string `xml:"UnitId"`
	UnitIDChild        string `xml:"UnitID"`
	XChild             string `xml:"X"`
	YChild             string `xml:"Y"`
	WidthChild         string `xml:"Width"`
	HeightChild        string `xml:"Height"`
	LineThickChild     string `xml:"LineThick"`
	FlowDirectionChild string `xml:"FlowDirection"`
	ForeColorChild     string `xml:"ForeColor"`
	EndCapChild        string `xml:"EndCap"`
	StartCapChild      string `xml:"StartCap"`
	DashStyleChild     string `xml:"DashStyle"`

	// Nested objects
	Objects []ObjectElement `xml:"Object"`
}

func (o ObjectElement) GetLineThick() string {
	if o.LineThick != "" {
		return o.LineThick
	}
	return o.LineThickChild
}

func (o ObjectElement) GetFlowDirection() string {
	if o.FlowDirection != "" {
		return o.FlowDirection
	}
	return o.FlowDirectionChild
}

func (o ObjectElement) GetForeColor() string {
	if o.ForeColor != "" {
		return o.ForeColor
	}
	return o.ForeColorChild
}

func (o ObjectElement) GetEndCap() string {
	if o.EndCap != "" {
		return o.EndCap
	}
	return o.EndCapChild
}

func (o ObjectElement) GetStartCap() string {
	if o.StartCap != "" {
		return o.StartCap
	}
	return o.StartCapChild
}

func (o ObjectElement) GetDashStyle() string {
	if o.DashStyle != "" {
		return o.DashStyle
	}
	return o.DashStyleChild
}

func (o ObjectElement) GetName() string {
	if o.Name != "" {
		return o.Name
	}
	return o.NameUpper
}

func (o ObjectElement) GetType() string {
	if o.Type != "" {
		return o.Type
	}
	return o.TypeUpper
}

// GetText returns the attribute value or falls back to the child element
func (o ObjectElement) GetText() string {
	if o.Text != "" {
		return o.Text
	}
	if o.TextUpper != "" {
		return o.TextUpper
	}
	return o.TextChild
}

func (o ObjectElement) GetSize() string {
	if o.Size != "" {
		return o.Size
	}
	if o.SizeUpper != "" {
		return o.SizeUpper
	}
	if o.SizeChild != "" {
		return o.SizeChild
	}
	// Fallback to Width/Height
	w := o.W
	if w == "" {
		w = o.WUpper
	}
	if w == "" {
		w = o.WidthChild
	}
	h := o.H
	if h == "" {
		h = o.HUpper
	}
	if h == "" {
		h = o.HeightChild
	}
	if w != "" && h != "" {
		return w + "," + h
	}
	return ""
}

func (o ObjectElement) GetLocation() string {
	if o.Location != "" {
		return o.Location
	}
	if o.LocationUpper != "" {
		return o.LocationUpper
	}
	if o.LocationChild != "" {
		return o.LocationChild
	}
	// Fallback to X/Y
	x := o.X
	if x == "" {
		x = o.XUpper
	}
	if x == "" {
		x = o.XChild
	}
	y := o.Y
	if y == "" {
		y = o.YUpper
	}
	if y == "" {
		y = o.YChild
	}
	if x != "" && y != "" {
		return x + "," + y
	}
	return ""
}

func (o ObjectElement) GetUnitId() string {
	if o.UnitId != "" {
		return o.UnitId
	}
	if o.UnitIdUpper != "" {
		return o.UnitIdUpper
	}
	if o.UnitID != "" {
		return o.UnitID
	}
	if o.UnitIdChild != "" {
		return o.UnitIdChild
	}
	return o.UnitIDChild
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
	if err := xml.Unmarshal(data, &raw); err != nil || len(raw.Objects) == 0 {
		// Try alternative root <MapLayout>
		var alt AlternativeMapXML
		if errAlt := xml.Unmarshal(data, &alt); errAlt == nil && len(alt.Objects) > 0 {
			raw.Version = alt.Version
			raw.Objects = alt.Objects
		} else {
			// Try alternative root <Map>
			var rootMap MapXMLRoot
			if errMap := xml.Unmarshal(data, &rootMap); errMap == nil && len(rootMap.Objects) > 0 {
				raw.Version = rootMap.Version
				raw.Objects = rootMap.Objects
			} else {
				// Try alternative root <Object>
				var rootObj ObjectXMLRoot
				if errObj := xml.Unmarshal(data, &rootObj); errObj == nil && len(rootObj.Objects) > 0 {
					raw.Version = rootObj.Version
					raw.Objects = rootObj.Objects
				} else {
					// Try LayoutDesignerControl root (common in .NET WinForms layouts)
					var layoutRoot LayoutDesignerRoot
					if errLayout := xml.Unmarshal(data, &layoutRoot); errLayout == nil && len(layoutRoot.Objects) > 0 {
						raw.Version = "1.0"
						raw.Objects = layoutRoot.Objects
					} else if err != nil {
						return nil, err
					}
				}
			}
		}
	}

	layout := &models.MapLayout{
		Version: raw.Version,
		Objects: make(map[string]models.MapObject),
	}

	fillLayout(layout, raw.Objects)

	return layout, nil
}

func fillLayout(layout *models.MapLayout, objects []ObjectElement) {
	for _, obj := range objects {
		name := obj.GetName()
		if name != "" {
			layout.Objects[name] = models.MapObject{
				Name:          name,
				Type:          obj.GetType(),
				Text:          obj.GetText(),
				Size:          obj.GetSize(),
				Location:      obj.GetLocation(),
				UnitId:        obj.GetUnitId(),
				LineThick:     obj.GetLineThick(),
				FlowDirection: obj.GetFlowDirection(),
				ForeColor:     obj.GetForeColor(),
				EndCap:        obj.GetEndCap(),
				StartCap:      obj.GetStartCap(),
				DashStyle:     obj.GetDashStyle(),
			}
		}

		// Recurse into children
		if len(obj.Objects) > 0 {
			fillLayout(layout, obj.Objects)
		}
	}
}
