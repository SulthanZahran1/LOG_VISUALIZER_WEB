import { selectedUnitId, getCarriersAtUnit, carrierTrackingEnabled } from '../../stores/mapStore';

import './CarrierPanel.css';

export function CarrierPanel() {
    const unitId = selectedUnitId.value;

    if (!unitId || !carrierTrackingEnabled.value) {
        return null;
    }

    const carriers = getCarriersAtUnit(unitId);

    return (
        <div className="carrier-panel">
            <div className="panel-header">
                <h4>Unit: {unitId}</h4>
                <button className="close-btn" onClick={() => selectedUnitId.value = null}>×</button>
            </div>

            <div className="panel-content">
                <div className="carrier-count">
                    {carriers.length} carrier{carriers.length !== 1 ? 's' : ''}
                </div>

                {carriers.length > 0 ? (
                    <ul className="carrier-list">
                        {carriers.map(id => (
                            <li key={id} className="carrier-item">
                                {id}
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
