<script lang="ts">
  import { api, type Profile } from './api';
  import { onMount } from 'svelte';
  import nlp from 'compromise';
  import { selectedProfile } from './stores/profileStore';
  import { browser } from '$app/environment';
  import { authStore } from './stores/authStore';
  import { activityTracker, ACTIVITY_TYPES } from './activityTracker';
  import './styles/prompt-components.css';

  let profiles: Profile[] = [];
  let showForm = false;
  let editingProfile: Profile | null = null;
  let currentUser: any = null;
  let newProfile: Omit<Profile, 'id'> = {
    name: '',
    description: '',
    attributes: {}
  };

  let descriptionTimeout: number;

  // Subscribe to auth state to get current user
  authStore.subscribe(state => {
    currentUser = state.user;
  });

  onMount(async () => {
    try {
      console.log('Loading profiles in onMount...');
      const loadedProfiles = await api.getProfiles();
      console.log('Loaded profiles:', loadedProfiles);
      profiles = loadedProfiles || []; // Ensure it's never null/undefined
    } catch (error) {
      console.error('Failed to load profiles:', error);
      profiles = []; // Fallback to empty array on error
    }
  });

  function selectProfile(profile: Profile) {
    selectedProfile.set(profile);
    console.log('Selected profile ID:', profile.id);
  }


  async function createProfile() {
    try {
      console.log('Creating profile with data:', newProfile);
      console.log('Current profiles before create:', profiles);
      
      const created = await api.createProfile(newProfile);
      console.log('Created profile response:', created);
      
      if (created) {
        // Track successful profile creation
        if (currentUser) {
          await activityTracker.trackProfileCreated(currentUser, created.id);
        }
        
        // Ensure profiles is an array before spreading
        if (!Array.isArray(profiles)) {
          console.warn('profiles is not an array, resetting to empty array:', profiles);
          profiles = [];
        }
        profiles = [...profiles, created];
        console.log('Updated profiles:', profiles);
        resetForm();
      } else {
        console.error('Failed to create profile: No data returned');
        // Track failure
        if (currentUser) {
          await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROFILE_CREATED, 'No data returned from API');
        }
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      // Track error
      if (currentUser) {
        await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROFILE_CREATED, `Profile creation error: ${error}`);
      }
    }
  }

  async function updateProfile() {
    if (!editingProfile) return;
    
    try {
      const updated = await api.updateProfile(editingProfile.id, newProfile);
      
      // Track successful profile update
      if (currentUser) {
        await activityTracker.trackProfileUpdated(currentUser, updated.id);
      }
      
      profiles = profiles.map(p => p.id === updated.id ? updated : p);
      resetForm();
    } catch (error) {
      console.error('Error updating profile:', error);
      // Track error
      if (currentUser) {
        await activityTracker.trackError(currentUser, ACTIVITY_TYPES.PROFILE_UPDATED, `Profile update error: ${error}`);
      }
    }
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
    // Scroll to form
    if (browser) {
      setTimeout(() => {
        document.querySelector('.form-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
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
      let interests: string[] = [];

      // Look for explicit interest lists first
      const interestListPattern = doc.match('interested in [*]');
      if (interestListPattern.found) {
        const interestText = interestListPattern.groups()[0]?.text();
        if (interestText) {
          // Split on common delimiters and clean up
          interests = interestText
            .split(/,|and|&|\n/)
            .map(s => s.trim())
            .filter(s => s.length > 1 && !['etc', 'etc.', 'etc etc'].includes(s.toLowerCase()));
        }
      }

      // If no explicit interests found, try general patterns
      if (interests.length === 0) {
        const interestPatterns = [
          doc.match('(studying|love|like|interested in|enjoy|passionate about) #Noun+'),
          doc.match('(love|like) (to #Verb|#Verb+ing)')
        ];

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
      }

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
        // Use regex to find City, State patterns more reliably
        const locationRegex = /(living in|in|from)\s+([A-Z][a-z\s]+),\s*([A-Z]{2})/i;
        const locationMatch = text.match(locationRegex);
        
        if (locationMatch) {
          location.city = locationMatch[2].trim();
          const stateAbbr = locationMatch[3].toUpperCase();
          
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
          
          location.state = stateMap[stateAbbr] || stateAbbr;
          location.country = 'USA';
        }
        
        // Fallback to compromise.js pattern if regex didn't work
        if (Object.keys(location).length === 0) {
          const cityStatePattern = doc.match('#ProperNoun+ #ProperNoun*, #Abbreviation');
          if (cityStatePattern.found) {
            const fullMatch = cityStatePattern.text();
            const parts = fullMatch.split(',').map(s => s.trim());
            if (parts.length === 2) {
              location.city = parts[0];
              const stateAbbr = parts[1].toUpperCase();
              
              // Use the same state map as above
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
              
              location.state = stateMap[stateAbbr] || stateAbbr;
              location.country = 'USA';
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
    if (browser) {
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
  }
</script>

<div class="profile-manager">
  <div class="component-header">
    <h2 class="component-title">👤 Profile Management
      <button class="btn btn-primary" on:click={() => showForm = !showForm}>
        <span class="icon">{showForm ? '✕' : '+'}</span>
        {showForm ? 'Cancel' : 'New Profile'}
      </button>
    </h2>
  </div>

  {#if showForm}
    <div class="form-container">
      <div class="form-header">
        <h3 class="form-title">
          {editingProfile ? '✏️ Edit Profile' : '✨ Create New Profile'}
        </h3>
        <p class="form-subtitle">
          {editingProfile ? 'Update your profile information below' : 'Tell us about yourself to create a personalized profile'}
        </p>
      </div>

      <form on:submit|preventDefault={editingProfile ? updateProfile : createProfile} class="profile-form">
        <div class="form-field">
          <label for="profile-name" class="field-label">Profile Name</label>
          <input
            id="profile-name"
            class="form-input"
            bind:value={newProfile.name}
            placeholder="e.g., Student, Developer, Designer"
            required
          />
          <p class="field-help">Choose a descriptive name for this profile</p>
        </div>

        <div class="form-field">
          <label for="description" class="field-label">About Yourself</label>
          <textarea
            id="description"
            class="form-textarea"
            bind:value={newProfile.description}
            on:input={handleDescriptionChange}
            placeholder="I am a 25-year-old student in Dallas studying Computer Science. I love history and enjoy reading about technology trends."
            rows="5"
            required
          ></textarea>
          <p class="field-help">
            🎨 <strong>AI will extract key details</strong> from your description automatically.
            Include age, location, occupation, and interests for best results.
          </p>
        </div>

        {#if Object.keys(newProfile.attributes).length > 0}
          <div class="extracted-section">
            <div class="section-header">
              <h4 class="section-title">🤖 AI Extracted Information</h4>
              <p class="section-subtitle">Review and edit the details we found from your description</p>
            </div>

            {#if newProfile.attributes.location}
              <div class="form-field">
                <label class="field-label">📍 Location Information</label>
                <div class="location-grid">
                  <div class="location-item">
                    <label for="city" class="location-label">City</label>
                    <input id="city" class="form-input" bind:value={newProfile.attributes.location.city} placeholder="Enter city" />
                  </div>
                  <div class="location-item">
                    <label for="state" class="location-label">State/Province</label>
                    <input id="state" class="form-input" bind:value={newProfile.attributes.location.state} placeholder="Enter state" />
                  </div>
                  <div class="location-item">
                    <label for="country" class="location-label">Country</label>
                    <input id="country" class="form-input" bind:value={newProfile.attributes.location.country} placeholder="Enter country" />
                  </div>
                </div>
              </div>
            {/if}

            <div class="form-row">
              {#if newProfile.attributes.gender !== undefined}
                <div class="form-field form-field-half">
                  <label for="gender" class="field-label">👤 Gender</label>
                  <select id="gender" class="form-select" bind:value={newProfile.attributes.gender}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="undisclosed">Prefer not to say</option>
                  </select>
                </div>
              {/if}

              {#if newProfile.attributes.age !== undefined}
                <div class="form-field form-field-half">
                  <label for="age" class="field-label">🎂 Age</label>
                  <input id="age" class="form-input" type="number" min="1" max="120" bind:value={newProfile.attributes.age} placeholder="Enter age" />
                </div>
              {/if}
            </div>

            {#each Object.entries(newProfile.attributes).filter(([key]) => key !== 'location' && key !== 'intent' && key !== 'gender' && key !== 'age') as [key, value]}
              <div class="form-field">
                <label class="field-label">
                  {#if key === 'interests'}🎨
                  {:else if key === 'occupation'}💼
                  {:else if key === 'education'}🎓
                  {:else}📄
                  {/if}
                  {key.replace(/_/g, ' ')}
                </label>
                {#if key === 'interests'}
                  <textarea
                    class="form-textarea"
                    rows="3"
                    value={Array.isArray(value) ? value.join(', ') : ''}
                    on:change={(e) => newProfile.attributes.interests = e.currentTarget.value.split(/,|\n/).map(s => s.trim()).filter(s => s)}
                    placeholder="e.g., Reading, Technology, History, Art"
                  ></textarea>
                  <p class="field-help">Separate multiple interests with commas or new lines</p>
                {:else if key === 'gender'}
                  <select class="form-select" bind:value={newProfile.attributes.gender}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="undisclosed">Prefer not to say</option>
                  </select>
                {:else if typeof value === 'object' && value !== null && !Array.isArray(value)}
                  <div class="sub-fields">
                    {#each Object.entries(value) as [subKey, subValue]}
                      <div class="sub-field">
                        <label class="sub-field-label">{subKey}</label>
                        <input class="form-input" bind:value={newProfile.attributes[key][subKey]} />
                      </div>
                    {/each}
                  </div>
                {:else}
                  <input class="form-input" bind:value={newProfile.attributes[key]} placeholder="Enter {key.replace(/_/g, ' ')}" />
                {/if}
              </div>
            {/each}

            {#if newProfile.attributes.intent !== undefined}
              <div class="form-field">
                <label for="intent" class="field-label">🎯 Goals & Intent</label>
                <textarea
                  id="intent"
                  class="form-textarea"
                  rows="3"
                  bind:value={newProfile.attributes.intent}
                  placeholder="What do you want to achieve? What are your goals?"
                ></textarea>
                <p class="field-help">Describe your main objectives or what you hope to accomplish</p>
              </div>
            {/if}
          </div>
        {/if}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary submit-btn">
            <span class="btn-icon">{editingProfile ? '💾' : '✨'}</span>
            <span class="btn-text">{editingProfile ? 'Update Profile' : 'Create Profile'}</span>
          </button>
          {#if editingProfile}
            <button type="button" class="btn btn-outline cancel-btn" on:click={resetForm}>
              <span class="btn-icon">✕</span>
              <span class="btn-text">Cancel Edit</span>
            </button>
          {/if}
        </div>
      </form>
    </div>
  {/if}

  <div class="profiles-section">
    <div class="section-header">
      <h3 class="section-title">📋 Your Profiles</h3>
      <p class="section-subtitle">
        {profiles.length === 0 ? 'No profiles created yet' : `${profiles.length} profile${profiles.length === 1 ? '' : 's'} available`}
      </p>
    </div>

    {#if profiles.length === 0}
      <div class="empty-state">
        <div class="empty-icon">👤</div>
        <h4>No Profiles Yet</h4>
        <p>Create your first profile to get started with personalized AI interactions</p>
      </div>
    {:else}
      <div class="profiles-grid">
        {#each profiles as profile}
          <div class="profile-card">
            <div class="profile-header">
              <button class="profile-name-link" on:click={() => editProfile(profile)} title="Edit this profile">
                {profile.name}
              </button>
              <div class="profile-actions">
                <button class="btn-icon" on:click={() => editProfile(profile)} title="Edit profile">
                  ✏️
                </button>
                <button class="btn-icon btn-danger" on:click={() => deleteProfile(profile)} title="Delete profile">
                  🗑️
                </button>
              </div>
            </div>
            <div class="profile-content">
              <p class="profile-description">
                {profile.description.length > 120 ? profile.description.substring(0, 120) + '...' : profile.description}
              </p>
              {#if Object.keys(profile.attributes).length > 0}
                <div class="profile-tags">
                  {#if profile.attributes.age}
                    <span class="tag">Age: {profile.attributes.age}</span>
                  {/if}
                  {#if profile.attributes.occupation}
                    <span class="tag">{profile.attributes.occupation}</span>
                  {/if}
                  {#if profile.attributes.location && profile.attributes.location.city}
                    <span class="tag">📍 {profile.attributes.location.city}</span>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
.profile-manager {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  width: 100%;
}

/* Form Container */
.form-container {
  background: var(--color-surface);
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.form-header {
  padding: var(--space-xl);
  /* background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%); */
  color: #0a0909;
  text-align: center;
}

@media (min-width: 768px) {
  .form-header {
    padding: var(--space-2xl);
  }
}

.form-title {
  margin: 0 0 var(--space-sm) 0;
  font-size: var(--font-xl);
  font-weight: 700;
}

@media (min-width: 768px) {
  .form-title {
    font-size: var(--font-2xl);
  }
}

.form-subtitle {
  margin: 0;
  font-size: var(--font-sm);
  opacity: 0.9;
  line-height: 1.4;
}

@media (min-width: 768px) {
  .form-subtitle {
    font-size: var(--font-md);
  }
}

/* Form Styles */
.profile-form {
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

@media (min-width: 768px) {
  .profile-form {
    padding: var(--space-2xl);
  }
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-field-half {
  flex: 1;
}

.field-label {
  font-weight: 600;
  font-size: var(--font-md);
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  text-transform: capitalize;
}

.field-help {
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  line-height: 1.4;
  margin: 0;
}

.field-help strong {
  color: var(--color-primary);
}

/* Form Row */
.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

@media (min-width: 768px) {
  .form-row {
    flex-direction: row;
    gap: var(--space-xl);
  }
}

/* Location Grid */
.location-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-md);
}

@media (min-width: 480px) {
  .location-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (min-width: 768px) {
  .location-grid {
    grid-template-columns: 1fr 1fr 1fr;
  }
}

.location-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.location-label {
  font-weight: 500;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
}

/* Extracted Section */
.extracted-section {
  border-top: 2px solid var(--color-border);
  padding-top: var(--space-xl);
  margin-top: var(--space-xl);
}

.section-header {
  margin-bottom: var(--space-lg);
}

.section-title {
  margin: 0 0 var(--space-xs) 0;
  font-size: var(--font-lg);
  color: var(--color-text);
  font-weight: 600;
}

@media (min-width: 768px) {
  .section-title {
    font-size: var(--font-xl);
  }
}

.section-subtitle {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  line-height: 1.4;
}

/* Sub Fields */
.sub-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.sub-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

@media (min-width: 768px) {
  .sub-field {
    flex-direction: row;
    align-items: center;
    gap: var(--space-md);
  }
}

.sub-field-label {
  font-weight: 500;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  text-transform: capitalize;
  min-width: 100px;
}

/* Form Actions */
.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-xl);
  padding-top: var(--space-xl);
  border-top: 2px solid var(--color-border);
}

@media (min-width: 768px) {
  .form-actions {
    flex-direction: row;
    justify-content: center;
  }
}

.submit-btn {
  order: 1;
  width: 100%;
  padding: var(--space-md) var(--space-xl);
  font-size: var(--font-lg);
  font-weight: 600;
  gap: var(--space-sm);
}

@media (min-width: 768px) {
  .submit-btn {
    order: 0;
    width: auto;
    min-width: 200px;
  }
}

.cancel-btn {
  order: 0;
  width: 100%;
}

@media (min-width: 768px) {
  .cancel-btn {
    order: 1;
    width: auto;
    min-width: 140px;
  }
}

.btn-outline {
  background-color: transparent;
  color: var(--color-text-muted);
  border: 2px solid var(--color-border);
}

.btn-outline:hover {
  background-color: var(--color-border);
  color: var(--color-text);
  transform: translateY(-2px);
}

/* Profiles Section */
.profiles-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: var(--space-2xl);
  background: var(--color-background);
  border: 2px dashed var(--color-border);
  border-radius: 12px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: var(--space-md);
  opacity: 0.5;
}

.empty-state h4 {
  margin: 0 0 var(--space-sm) 0;
  color: var(--color-text-muted);
  font-weight: 600;
}

.empty-state p {
  margin: 0;
  color: var(--color-text-light);
  font-size: var(--font-sm);
}

/* Profiles Grid */
.profiles-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-lg);
}

@media (min-width: 768px) {
  .profiles-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .profiles-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

/* Profile Card */
.profile-card {
  background: var(--color-surface);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.profile-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
  border-color: var(--color-primary);
}

.profile-header {
  padding: var(--space-lg);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
}

.profile-name-link {
  margin: 0;
  font-size: var(--font-lg);
  font-weight: 600;
  color: var(--color-primary);
  flex: 1;
  min-width: 0;
  word-wrap: break-word;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: color 0.2s ease;
}

.profile-name-link:hover {
  color: var(--color-primary-dark);
  text-decoration: underline;
}

.profile-actions {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-shrink: 0;
}

.btn-sm {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--font-sm);
  min-height: 36px;
  border-radius: 6px;
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: var(--space-xs);
  background: var(--color-background);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: var(--font-md);
}

.btn-icon:hover {
  background: var(--color-border);
  transform: translateY(-1px);
}

.btn-danger:hover {
  background: #fee2e2;
  border-color: #fecaca;
  color: #dc2626;
}

.profile-content {
  padding: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.profile-description {
  margin: 0;
  font-size: var(--font-sm);
  color: var(--color-text-muted);
  line-height: 1.5;
}

.profile-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.tag {
  display: inline-block;
  padding: var(--space-xs) var(--space-sm);
  background: var(--color-background);
  color: var(--color-text-muted);
  border-radius: 16px;
  font-size: var(--font-xs);
  border: 1px solid var(--color-border);
}

</style>