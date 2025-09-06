<script lang="ts">
  import { api, type Profile } from './api';
  import { onMount } from 'svelte';
  import nlp from 'compromise';

  let profiles: Profile[] = [];
  let showForm = false;
  let editingProfile: Profile | null = null;
  let newProfile: Omit<Profile, 'id'> = {
    name: '',
    description: '',
    attributes: {}
  };

  let descriptionTimeout: number;

  onMount(async () => {
    try {
      profiles = await api.getProfiles();
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  });

  async function createProfile() {
    try {
      const created = await api.createProfile(newProfile);
      if (created) {
        profiles = [...profiles, created];
        resetForm();
      } else {
        console.error('Failed to create profile: No data returned');
      }
    } catch (error) {
      console.error('Error creating profile:', error);
    }
  }

  async function updateProfile() {
    if (!editingProfile) return;
    const updated = await api.updateProfile(editingProfile.id, newProfile);
    profiles = profiles.map(p => p.id === updated.id ? updated : p);
    resetForm();
  }

  async function deleteProfile(profile: Profile) {
    if (confirm(`Delete profile: ${profile.name}?`)) {
      await api.deleteProfile(profile.id);
      profiles = profiles.filter(p => p.id !== profile.id);
    }
  }

  function editProfile(profile: Profile) {
    editingProfile = profile;
    newProfile = {
      name: profile.name,
      description: profile.description,
      attributes: { ...profile.attributes }
    };
    showForm = true;
  }

  function resetForm() {
    newProfile = { name: '', description: '', attributes: {} };
    editingProfile = null;
    showForm = false;
  }

  function extractAttributesWithCompromise(text: string) {
    const doc = nlp(text);
    const attributes: Profile['attributes'] = {};

    try {
      // Age
      const agePattern = doc.match('#Value #Unit? (year|years) old');
      const ageNumbers = agePattern.numbers().out('array');
      if (ageNumbers.length > 0) {
        attributes.age = ageNumbers[0];
      } else {
        // Try alternative age patterns
        const altAgePattern = doc.match('#Value (year|years) old');
        const altAgeNumbers = altAgePattern.numbers().out('array');
        if (altAgeNumbers.length > 0) {
          attributes.age = altAgeNumbers[0];
        }
      }

      // Gender
      const genderPattern = doc.match('(male|female|man|woman|guy|girl)');
      if (genderPattern.found) {
        const gender = genderPattern.text().toLowerCase();
        if (gender === 'man' || gender === 'guy' || gender === 'male') {
          attributes.gender = 'male';
        } else if (gender === 'woman' || gender === 'girl' || gender === 'female') {
          attributes.gender = 'female';
        }
      }

      // Occupation
      const occupationPattern = doc.match('(student|developer|engineer|doctor|teacher|designer|manager|programmer|nurse|lawyer|architect|artist|writer|scientist)');
      if (occupationPattern.found) {
        attributes.occupation = occupationPattern.text();
      }

      // Interests - improved pattern matching
      const interestPatterns = [
        doc.match('(studying|love|like|interested in|enjoy|passionate about) #Noun+'),
        doc.match('(love|like) (to #Verb|#Verb+ing)'),
        doc.match('interested in #Noun+')
      ];

      let interests: string[] = [];
      interestPatterns.forEach(pattern => {
        if (pattern.found) {
          const extracted = pattern.nouns().out('array');
          interests = [...interests, ...extracted];
        }
      });

      // Remove duplicates and common words
      interests = [...new Set(interests)].filter(interest => 
        interest.length > 2 && !['thing', 'things', 'stuff'].includes(interest.toLowerCase())
      );

      if (interests.length > 0) {
        attributes.interests = interests;
      }

      // Location - Using comprehensive pattern matching
      const location: { city?: string; state?: string; country?: string } = {};
      
      // Try built-in places detection if available
      try {
        const places = doc.places();
        if (places && places.length > 0) {
          const placesList = places.out('array');
          if (placesList.length > 0) {
            const firstPlace = placesList[0];
            
            // Check if it's a US state
            const usStates = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
            
            const lowerPlace = firstPlace.toLowerCase();
            if (usStates.includes(lowerPlace)) {
              location.state = firstPlace;
              location.country = 'USA';
            } else if (['usa', 'united states', 'america', 'us'].includes(lowerPlace)) {
              location.country = 'USA';
            } else {
              location.city = firstPlace;
            }
          }
        }
      } catch (e) {
        // Built-in places detection not available, use pattern matching
      }
      
      // Enhanced pattern matching for locations
      if (Object.keys(location).length === 0) {
        // Look for City, State patterns first (like "Flower Mound, TX")
        const cityStatePattern = doc.match('#ProperNoun+ #ProperNoun*, #Abbreviation');
        if (cityStatePattern.found) {
          const fullMatch = cityStatePattern.text();
          const parts = fullMatch.split(',').map(s => s.trim());
          if (parts.length === 2) {
            location.city = parts[0];
            const stateAbbr = parts[1].toUpperCase();
            
            // Map state abbreviations to full names
            const stateMap: Record<string, string> = {
              'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
              'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
              'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
              'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
              'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
              'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
              'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
              'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
              'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
              'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
            };
            
            if (stateMap[stateAbbr]) {
              location.state = stateMap[stateAbbr];
              location.country = 'USA';
            } else {
              location.state = stateAbbr;
            }
          }
        }
        
        // If city-state pattern didn't work, try other location patterns
        if (Object.keys(location).length === 0) {
          const locationPatterns = [
            doc.match('(in|from|at|living in|located in|studying in) [#Place+ #Place*]'),
            doc.match('(in|from|at|living in|located in|studying in) [#ProperNoun+ #ProperNoun*]'),
            doc.match('in [#ProperNoun+ #ProperNoun*]'), // More general "in" pattern
            doc.match('(in|from|at|living in|located in|studying in) [*]')
          ];
          
          for (const pattern of locationPatterns) {
            if (pattern.found) {
              const groups = pattern.groups();
              if (groups && groups.length > 0) {
                const locationText = groups[0].text().trim();
                if (locationText && locationText.length > 0 && locationText.length < 50) {
                  const usStates = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
                  
                  const lowerLocation = locationText.toLowerCase();
                  if (usStates.includes(lowerLocation)) {
                    location.state = locationText;
                    location.country = 'USA';
                  } else if (['usa', 'united states', 'america', 'us'].includes(lowerLocation)) {
                    location.country = 'USA';
                  } else {
                    location.city = locationText;
                  }
                  break;
                }
              }
            }
          }
        }
      }
      
      // Always initialize location object with empty city field for user input
      if (Object.keys(location).length === 0) {
        location.city = '';
      }
      
      // Ensure city field exists even if we found other location data
      if (!location.city) {
        location.city = '';
      }
      
      attributes.location = location;

      // Intent
      const intentPattern = doc.match('(intent is to|goal is to|want to|looking to|hoping to) [*]');
      
      if (intentPattern.found) {
        const groups = intentPattern.groups();
        if (groups ) {
          const intentText = groups[0].text().trim();
          if (intentText) {
            attributes.intent = intentText;
          }
        }
      }
      // Intent
      // const intentPattern = doc.match('(my intent is to|intent is to|my goal is to|goal is to|I want to|want to|I am looking to|looking to|I am hoping to|hoping to) [*]');
      // if (intentPattern.found) {
      //   const groups = intentPattern.groups();
      //   if (groups && groups.length > 0) {
      //     const intentText = groups[0].text().trim();
      //     if (intentText) {
      //       attributes.intent = intentText;
      //     }
      //   }
      // }

    } catch (error) {
      console.warn('Error during attribute extraction:', error);
    }

    return attributes;
  }

  function handleDescriptionChange() {
    clearTimeout(descriptionTimeout);
    descriptionTimeout = window.setTimeout(() => {
      if (newProfile.description.length > 10) {
        const extracted = extractAttributesWithCompromise(newProfile.description);
        newProfile.attributes = { ...newProfile.attributes, ...extracted };
        if (newProfile.attributes.intent === undefined) {
          newProfile.attributes.intent = '';
        }
      }
    }, 300); // Debounce for 300ms
  }
</script>

<div class="profile-manager">
  <h2>Profiles</h2>

  <button on:click={() => showForm = !showForm}>
    {showForm ? 'Cancel' : '+ New Profile'}
  </button>

  {#if showForm}
    <form on:submit|preventDefault={editingProfile ? updateProfile : createProfile} class="profile-form">
      <input bind:value={newProfile.name} placeholder="Profile Name (e.g., Student, Developer)" required />
      
      <div class="description-section">
        <label for="description">Tell us about yourself</label>
        <textarea 
          id="description"
          bind:value={newProfile.description} 
          on:input={handleDescriptionChange}
          placeholder="I am a 25-year-old student in Dallas studying Computer Science and love history." 
          rows="4"
          required
        ></textarea>
        <p class="description-hint">Best results come from writing a description.</p>
      </div>

      {#if Object.keys(newProfile.attributes).length > 0}
        <div class="extracted-fields">
          <h3>Extracted fields</h3>

          {#if newProfile.attributes.location}
            <div class="location-fields">
              <div class="location-field">
                <label for="city">City</label>
                <input id="city" bind:value={newProfile.attributes.location.city} />
              </div>
              <div class="location-field">
                <label for="state">State</label>
                <input id="state" bind:value={newProfile.attributes.location.state} />
              </div>
              <div class="location-field">
                <label for="country">Country</label>
                <input id="country" bind:value={newProfile.attributes.location.country} />
              </div>
            </div>
          {/if}

          <div class="form-row">
            {#if newProfile.attributes.gender !== undefined}
              <div class="field-inline">
                <label for="gender">Gender</label>
                <select id="gender" bind:value={newProfile.attributes.gender}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="undisclosed">Undisclosed</option>
                </select>
              </div>
            {/if}

            {#if newProfile.attributes.age !== undefined}
              <div class="field-inline">
                <label for="age">Age</label>
                <input id="age" type="number" bind:value={newProfile.attributes.age} />
              </div>
            {/if}
          </div>

          {#each Object.entries(newProfile.attributes).filter(([key]) => key !== 'location' && key !== 'intent' && key !== 'gender' && key !== 'age') as [key, value]}
            <div class="field">
              <label>{key.replace(/_/g, ' ')}</label>
              {#if key === 'interests'}
                <div>
                  <p/>
                  <textarea 
                    rows="3"
                    value={Array.isArray(value) ? value.join(', ') : ''} 
                    on:change={(e) => newProfile.attributes.interests = e.currentTarget.value.split(/,|\n/).map(s => s.trim()).filter(s => s)}
                  ></textarea>
                  <p class="field-hint">Multiple interests can be separated by a comma or a new line.</p>
                </div>
              {:else if key === 'gender'}
                <select bind:value={newProfile.attributes.gender}>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="undisclosed">Undisclosed</option>
                </select>
              {:else if typeof value === 'object' && value !== null && !Array.isArray(value)}
                {#each Object.entries(value) as [subKey, subValue]}
                  <div class="sub-field">
                    <label>{subKey}</label>
                    <input bind:value={newProfile.attributes[key][subKey]} />
                  </div>
                {/each}
              {:else}
                <input bind:value={newProfile.attributes[key]} />
              {/if}
            </div>
          {/each}

          {#if newProfile.attributes.intent !== undefined}
            <div class="field">
              <label for="intent">Intent</label>
              <textarea id="intent" rows="2" bind:value={newProfile.attributes.intent}></textarea>
            </div>
          {/if}
        </div>
      {/if}

      <button type="submit">{editingProfile ? 'Update' : 'Create'} Profile</button>
      {#if editingProfile}
        <button type="button" on:click={resetForm}>Cancel Edit</button>
      {/if}
    </form>
  {/if}

  <div class="profiles-list">
    {#each profiles as profile}
      <div class="profile-item">
        <div class="profile-actions">
          <button class="icon-btn edit-btn" on:click={() => editProfile(profile)} title="Edit">
            ✏️
          </button>
          <button class="icon-btn delete-btn" on:click={() => deleteProfile(profile)} title="Delete">
            🗑️
          </button>
        </div>
        <div class="profile-display">
          <strong>{profile.name}</strong>: {profile.description.substring(0, 100)}{profile.description.length > 100 ? '...' : ''}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .profile-manager {
    margin: 20px;
  }
  .profile-form {
    display: flex;
    flex-direction: column;
    gap: 15px;
    max-width: 600px;
    margin: 20px 0;
    padding: 20px;
    border: 1px solid #eee;
    border-radius: 8px;
    background: #fdfdfd;
  }
  .profile-form input,
  .profile-form textarea,
  .profile-form select {
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    box-sizing: border-box; /* Ensures padding doesn't add to width/height */
  }

  .field textarea {
    width: 100%;
  }
  .description-section {
    display: flex;
    flex-direction: column;
  }
  .description-section label {
    font-weight: bold;
    margin-bottom: 5px;
  }
  .description-hint {
    font-size: 0.9rem;
    color: #666;
    margin-top: 5px;
  }
  .extracted-fields {
    margin-top: 10px;
    border-top: 1px solid #eee;
    padding-top: 15px;
  }
  .extracted-fields h3 {
    margin-bottom: 10px;
  }
  .field {
    display: grid;
    grid-template-columns: 150px 1fr;
    gap: 10px;
    align-items: center;
    margin-bottom: 15px;
  }
  .field label {
    text-transform: capitalize;
    font-weight: 500;
    padding-top: 10px;
  }
  .field-hint {
    font-size: 0.8rem;
    color: #666;
    margin-top: 2px;
  }
  .form-row {
    display: flex;
    gap: 20px;
    align-items: center; /* Align items vertically */
  }
  .field-inline {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }
  .field-inline label {
    text-transform: capitalize;
    font-weight: 500;
    margin-bottom: 5px;
  }
  .location-fields {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 15px;
    margin-bottom: 15px;
  }
  .location-field {
    display: flex;
    flex-direction: column;
  }
  .location-field label {
    margin-bottom: 5px;
    font-weight: 500;
    text-transform: capitalize;
  }
  .sub-field {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 5px;
    align-items: center;
  }
  .profiles-list {
    margin-top: 20px;
  }
  .profile-item {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 12px 15px;
    border-bottom: 1px solid #eee;
    background: white;
  }
  .profile-item:hover {
    background: #f8f8f8;
  }
  .profile-actions {
    display: flex;
    gap: 8px;
  }
  .profile-display {
    font-size: 14px;
    color: #333;
  }
  .icon-btn {
    padding: 6px;
    font-size: 16px;
    border-radius: 4px;
    background: #f8f9fa;
    border: 1px solid #dee2e6;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
  }
  .icon-btn:hover {
    background: #e9ecef;
  }
  button {
    padding: 10px 15px;
    background: #007cba;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover {
    background: #005a87;
  }
</style>