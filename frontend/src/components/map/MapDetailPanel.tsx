import { selectedUnitId, mapLayout, getCarriersAtUnit } from '../../stores/mapStore';
import { BoxIcon } from '../icons';
import './MapDetailPanel.css';

export function MapDetailPanel() {
    const unitId = selectedUnitId.value;
    if (!unitId) return null;

    const layout = mapLayout.value;
    if (!layout) return null;

    // Find the object with this unitId
    const object = Object.values(layout.objects).find(obj => obj.unitId === unitId);

    if (!object) return null;

    const carriers = getCarriersAtUnit(unitId);

    return (
        <div class="map-detail-panel">
            <div class="detail-header">
                <h3>Unit Details</h3>
                <button class="close-btn" onClick={() => selectedUnitId.value = null}>&times;</button>
            </div>

            <div class="detail-content">
                <div class="detail-section">
                    <h4>Object Info</h4>
                    <DetailRow label="Name" value={object.name} />
                    <DetailRow label="Type" value={getFriendlyType(object.type)} />
                    <DetailRow label="Unit ID" value={object.unitId} />
                    <DetailRow label="Location" value={object.location} />
                    <DetailRow label="Size" value={object.size} />
                    {object.text && <DetailRow label="Text" value={object.text} />}
                </div>

                <div class="detail-section">
                    <h4>Carrier Status</h4>
                    {carriers.length > 0 ? (
                        <>
                            <div class="carrier-count">Count: {carriers.length}</div>
                            <ul class="carrier-list">
                                {carriers.map(id => (
                                    <li key={id} class="carrier-item">
                                        <span class="carrier-icon"><BoxIcon size={14} /></span>
                                        <span class="carrier-id">{id}</span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <div class="no-carriers">No carriers present</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DetailRow({ label, value }: { label: string, value: string }) {
    return (
        <div class="detail-row">
            <span class="detail-label">{label}</span>
            <span class="detail-value">{value}</span>
        </div>
    );
}

function getFriendlyType(type: string) {
    if (!type) return 'Unknown';
    // Remove namespaces
    const parts = type.split(',');
    const main = parts[0].split('.');
    return main[main.length - 1];
}
