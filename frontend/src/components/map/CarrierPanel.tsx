import {
    selectedUnitId, getCarriersAtUnit, carrierTrackingEnabled,
    latestSignalValues, carrierLocations, centerOnUnit,
    followedCarrierId, centerOnCarrier
} from '../../stores/mapStore';
import { TargetIcon, XIcon } from '../icons';

import './CarrierPanel.css';

export function CarrierPanel() {
    const unitId = selectedUnitId.value;

    // Trigger re-render on state changes
    void latestSignalValues.value;
    void carrierLocations.value;

    if (!unitId || !carrierTrackingEnabled.value) {
        return null;
    }

    const carriers = getCarriersAtUnit(unitId);

    return (
        <div className="carrier-panel">
            <div className="panel-header">
                <h4>Unit: {unitId}</h4>
                <div className="header-actions">
                    <button
                        className="center-unit-btn"
                        onClick={() => centerOnUnit(unitId)}
                        title="Center view on this unit"
                    >
                        <TargetIcon size={14} />
                    </button>
                    <button className="close-btn" onClick={() => selectedUnitId.value = null}><XIcon size={14} /></button>
                </div>
            </div>

            <div className="panel-content">
                <div className="carrier-count">
                    {carriers.length} carrier{carriers.length !== 1 ? 's' : ''}
                </div>

                {carriers.length > 0 ? (
                    <ul className="carrier-list">
                        {carriers.map(id => (
                            <li key={id} className="carrier-item">
                                <span className="carrier-id">{id}</span>
                                <div className="item-actions">
                                    <button
                                        className={`follow-toggle-btn ${followedCarrierId.value === id ? 'active' : ''}`}
                                        onClick={() => {
                                            if (followedCarrierId.value === id) {
                                                followedCarrierId.value = null;
                                            } else {
                                                followedCarrierId.value = id;
                                                centerOnCarrier(id);
                                            }
                                        }}
                                        title={followedCarrierId.value === id ? 'Stop following' : 'Follow this carrier'}
                                    >
                                        {followedCarrierId.value === id ? 'Following' : 'Follow'}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="no-carriers">No carriers at this unit</p>
                )}
            </div>
        </div>
    );
}
