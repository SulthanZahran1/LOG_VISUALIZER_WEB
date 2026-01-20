import { useSignal } from '@preact/signals';
import { carrierLocations, followedCarrierId, centerOnCarrier } from '../../stores/mapStore';
import { TargetIcon, EyeIcon, CenterIcon } from '../icons';
import './MapFollowControls.css';

export function MapFollowControls() {
    const searchQuery = useSignal('');
    const showDropdown = useSignal(false);

    const carriers = Array.from(carrierLocations.value.keys());
    const filteredCarriers = carriers.filter(id =>
        id.toLowerCase().includes(searchQuery.value.toLowerCase())
    ).slice(0, 50); // Limit dropdown

    const handleSelect = (id: string) => {
        followedCarrierId.value = id;
        searchQuery.value = id;
        showDropdown.value = false;
        centerOnCarrier(id);
    };

    const toggleFollow = () => {
        if (followedCarrierId.value) {
            followedCarrierId.value = null;
        } else if (searchQuery.value) {
            // If we have a exact match in search, follow it
            const exactMatch = carriers.find(id => id.toLowerCase() === searchQuery.value.toLowerCase());
            if (exactMatch) {
                followedCarrierId.value = exactMatch;
                centerOnCarrier(exactMatch);
            }
        }
    };

    return (
        <div class="map-follow-controls">
            <div class="search-wrapper">
                <input
                    type="text"
                    placeholder="Search Carrier ID..."
                    value={searchQuery.value}
                    onInput={(e) => {
                        searchQuery.value = (e.target as HTMLInputElement).value;
                        showDropdown.value = true;
                    }}
                    onFocus={() => showDropdown.value = true}
                    class="follow-search-input"
                />
                {showDropdown.value && searchQuery.value && filteredCarriers.length > 0 && (
                    <ul class="follow-dropdown">
                        {filteredCarriers.map(id => (
                            <li key={id} onClick={() => handleSelect(id)}>
                                {id}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <button
                class={`follow-btn ${followedCarrierId.value ? 'active' : ''}`}
                onClick={toggleFollow}
                disabled={!followedCarrierId.value && !carriers.find(id => id.toLowerCase() === searchQuery.value.toLowerCase())}
                title={followedCarrierId.value ? 'Stop following' : 'Follow carrier'}
            >
                {followedCarrierId.value ? <><TargetIcon size={14} /> Following</> : <><EyeIcon size={14} /> Follow</>}
            </button>
            <button
                class="center-btn"
                onClick={() => followedCarrierId.value && centerOnCarrier(followedCarrierId.value)}
                disabled={!followedCarrierId.value}
                title="Re-center on followed carrier"
            >
                <CenterIcon size={14} />
            </button>
        </div>
    );
}
