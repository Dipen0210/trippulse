use spacetimedb::{table, reducer, Identity, ReducerContext, Timestamp, Table};

// ── Tables ────────────────────────────────────────────────────────────────────

#[table(name = user_profile, public)]
pub struct UserProfile {
    #[primary_key]
    pub identity: Identity,
    pub username: String,
    pub email: String,
    pub avatar_color: String,
    pub created_at: Timestamp,
}

#[table(name = trip, public)]
pub struct Trip {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    pub owner: Identity,
    pub name: String,
    pub destination: String,
    pub country: String,
    pub photo: String,
    pub origin: String,
    pub origin_lat: f64,
    pub origin_lng: f64,
    pub start_date: String,
    pub end_date: String,
    pub created_at: Timestamp,
}

#[table(name = trip_member, public)]
pub struct TripMember {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub trip_id: u64,
    pub identity: Identity,
    pub role: String,
    pub joined_at: Timestamp,
}

#[table(name = trip_invite, public)]
pub struct TripInvite {
    #[primary_key]
    pub code: String,
    #[index(btree)]
    pub trip_id: u64,
    pub created_by: Identity,
    pub role: String,
    pub created_at: Timestamp,
}

#[table(name = itinerary_item, public)]
pub struct ItineraryItem {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub trip_id: u64,
    pub day: u32,
    pub position: u32,
    pub place_name: String,
    pub address: String,
    pub category: String,
    pub lat: f64,
    pub lng: f64,
    pub visited: bool,
    pub notes: String,
    pub suggested_time: String,
    pub duration_str: String,
    pub tip: String,
    pub is_free: bool,
    pub cost: String,
    pub rating: f32,
    pub review_count: String,
    pub booking_note: String,
    pub booking_url: String,
    pub transport_mode: String,
    pub transport_distance: String,
    pub transport_duration: String,
    pub transport_detail: String,
    pub added_by: Identity,
    pub added_at: Timestamp,
}

#[table(name = trip_day_meta, public)]
pub struct TripDayMeta {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub trip_id: u64,
    pub day: u32,
    pub title: String,
    pub summary: String,
    pub warning: String,
}

#[table(name = trip_ai_content, public)]
pub struct TripAiContent {
    #[primary_key]
    pub trip_id: u64,
    pub tips_json: String,
    pub arrival_json: String,
    pub preferences_json: String,
    pub updated_at: Timestamp,
}

#[table(name = presence, public)]
pub struct Presence {
    #[primary_key]
    pub identity: Identity,
    #[index(btree)]
    pub trip_id: u64,
    pub current_day: u32,
    pub last_seen: Timestamp,
}

/// Live GPS location broadcast during an active trip.
/// One row per user — updated in-place as they move.
#[table(name = live_location, public)]
pub struct LiveLocation {
    #[primary_key]
    pub identity: Identity,
    #[index(btree)]
    pub trip_id: u64,
    pub lat: f64,
    pub lng: f64,
    pub is_active: bool,
    pub updated_at: Timestamp,
}

/// A place suggested to the group (from Discover or AI recommendations) that
/// members vote Yes/No on before it's committed to the plan.
#[table(name = place_proposal, public)]
pub struct PlaceProposal {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub trip_id: u64,
    pub day: u32,
    pub place_name: String,
    pub address: String,
    pub category: String,
    pub lat: f64,
    pub lng: f64,
    pub tip: String,
    pub is_free: bool,
    pub cost: String,
    pub rating: f32,
    pub review_count: String,
    pub source: String, // "ai" | "discover" | "search"
    pub proposed_by: Identity,
    pub created_at: Timestamp,
}

/// A single member's Yes/No vote on a place proposal (one per member per proposal).
#[table(name = place_vote, public)]
pub struct PlaceVote {
    #[primary_key]
    #[auto_inc]
    pub id: u64,
    #[index(btree)]
    pub proposal_id: u64,
    #[index(btree)]
    pub trip_id: u64,
    pub identity: Identity,
    pub vote: bool, // true = yes (want to go), false = no
    pub voted_at: Timestamp,
}

// ── Reducers ──────────────────────────────────────────────────────────────────

#[reducer]
pub fn register(
    ctx: &ReducerContext,
    username: String,
    email: String,
    avatar_color: String,
) -> Result<(), String> {
    if let Some(mut profile) = ctx.db.user_profile().identity().find(ctx.sender) {
        profile.username = username;
        profile.email = email;
        profile.avatar_color = avatar_color;
        ctx.db.user_profile().identity().update(profile);
    } else {
        ctx.db.user_profile().insert(UserProfile {
            identity: ctx.sender,
            username,
            email,
            avatar_color,
            created_at: ctx.timestamp,
        });
    }
    Ok(())
}

#[reducer]
pub fn create_trip(
    ctx: &ReducerContext,
    name: String,
    destination: String,
    country: String,
    photo: String,
    origin: String,
    origin_lat: f64,
    origin_lng: f64,
    start_date: String,
    end_date: String,
) -> Result<(), String> {
    let trip = ctx.db.trip().insert(Trip {
        id: 0,
        owner: ctx.sender,
        name,
        destination,
        country,
        photo,
        origin,
        origin_lat,
        origin_lng,
        start_date,
        end_date,
        created_at: ctx.timestamp,
    });

    ctx.db.trip_member().insert(TripMember {
        id: 0,
        trip_id: trip.id,
        identity: ctx.sender,
        role: "owner".to_string(),
        joined_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn update_trip(
    ctx: &ReducerContext,
    trip_id: u64,
    name: String,
    photo: String,
    start_date: String,
    end_date: String,
    origin: String,
    origin_lat: f64,
    origin_lng: f64,
) -> Result<(), String> {
    require_owner(ctx, trip_id)?;

    let mut trip = ctx.db.trip().id().find(trip_id)
        .ok_or("Trip not found")?;

    trip.name = name;
    trip.photo = photo;
    trip.start_date = start_date;
    trip.end_date = end_date;
    trip.origin = origin;
    trip.origin_lat = origin_lat;
    trip.origin_lng = origin_lng;
    ctx.db.trip().id().update(trip);

    Ok(())
}

#[reducer]
pub fn delete_trip(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    require_owner(ctx, trip_id)?;

    // Delete all related data
    let items: Vec<_> = ctx.db.itinerary_item().trip_id().filter(trip_id).collect();
    for item in items {
        ctx.db.itinerary_item().id().delete(item.id);
    }

    let members: Vec<_> = ctx.db.trip_member().trip_id().filter(trip_id).collect();
    for member in members {
        ctx.db.trip_member().id().delete(member.id);
    }

    let day_metas: Vec<_> = ctx.db.trip_day_meta().trip_id().filter(trip_id).collect();
    for dm in day_metas {
        ctx.db.trip_day_meta().id().delete(dm.id);
    }

    let invites: Vec<_> = ctx.db.trip_invite().trip_id().filter(trip_id).collect();
    for invite in invites {
        ctx.db.trip_invite().code().delete(invite.code);
    }

    let votes: Vec<_> = ctx.db.place_vote().trip_id().filter(trip_id).collect();
    for v in votes {
        ctx.db.place_vote().id().delete(v.id);
    }

    let proposals: Vec<_> = ctx.db.place_proposal().trip_id().filter(trip_id).collect();
    for p in proposals {
        ctx.db.place_proposal().id().delete(p.id);
    }

    ctx.db.trip_ai_content().trip_id().delete(trip_id);

    let live_locs: Vec<_> = ctx.db.live_location().trip_id().filter(trip_id).collect();
    for ll in live_locs {
        ctx.db.live_location().identity().delete(ll.identity);
    }

    ctx.db.trip().id().delete(trip_id);

    Ok(())
}

#[reducer]
pub fn create_invite(
    ctx: &ReducerContext,
    trip_id: u64,
    code: String,
    role: String,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    ctx.db.trip_invite().insert(TripInvite {
        code,
        trip_id,
        created_by: ctx.sender,
        role,
        created_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn join_trip(ctx: &ReducerContext, code: String) -> Result<(), String> {
    let invite = ctx.db.trip_invite().code().find(&code)
        .ok_or("Invite code not found")?;

    let already_member = ctx.db.trip_member()
        .trip_id()
        .filter(invite.trip_id)
        .any(|m| m.identity == ctx.sender);

    if already_member {
        return Err("Already a member of this trip".to_string());
    }

    ctx.db.trip_member().insert(TripMember {
        id: 0,
        trip_id: invite.trip_id,
        identity: ctx.sender,
        role: invite.role,
        joined_at: ctx.timestamp,
    });

    Ok(())
}

/// Join a trip directly via its id (used by shareable invite links).
/// Anyone with the link can join as an editor; idempotent if already a member.
#[reducer]
pub fn join_trip_open(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    let _trip = ctx.db.trip().id().find(trip_id)
        .ok_or("Trip not found")?;

    let already_member = ctx.db.trip_member()
        .trip_id()
        .filter(trip_id)
        .any(|m| m.identity == ctx.sender);

    if already_member {
        return Ok(());
    }

    ctx.db.trip_member().insert(TripMember {
        id: 0,
        trip_id,
        identity: ctx.sender,
        role: "editor".to_string(),
        joined_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn remove_member(ctx: &ReducerContext, member_id: u64) -> Result<(), String> {
    let member = ctx.db.trip_member().id().find(member_id)
        .ok_or("Member not found")?;

    if member.role == "owner" {
        return Err("Cannot remove the trip owner".to_string());
    }

    require_owner(ctx, member.trip_id)?;
    ctx.db.trip_member().id().delete(member_id);

    Ok(())
}

#[reducer]
pub fn add_itinerary_item(
    ctx: &ReducerContext,
    trip_id: u64,
    day: u32,
    position: u32,
    place_name: String,
    address: String,
    category: String,
    lat: f64,
    lng: f64,
    notes: String,
    suggested_time: String,
    duration_str: String,
    tip: String,
    is_free: bool,
    cost: String,
    rating: f32,
    review_count: String,
    booking_note: String,
    booking_url: String,
    transport_mode: String,
    transport_distance: String,
    transport_duration: String,
    transport_detail: String,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    ctx.db.itinerary_item().insert(ItineraryItem {
        id: 0,
        trip_id,
        day,
        position,
        place_name,
        address,
        category,
        lat,
        lng,
        visited: false,
        notes,
        suggested_time,
        duration_str,
        tip,
        is_free,
        cost,
        rating,
        review_count,
        booking_note,
        booking_url,
        transport_mode,
        transport_distance,
        transport_duration,
        transport_detail,
        added_by: ctx.sender,
        added_at: ctx.timestamp,
    });

    Ok(())
}

#[reducer]
pub fn update_item_notes(
    ctx: &ReducerContext,
    item_id: u64,
    notes: String,
) -> Result<(), String> {
    let mut item = ctx.db.itinerary_item().id().find(item_id)
        .ok_or("Item not found")?;

    require_member(ctx, item.trip_id)?;
    item.notes = notes;
    ctx.db.itinerary_item().id().update(item);

    Ok(())
}

#[reducer]
pub fn remove_itinerary_item(ctx: &ReducerContext, item_id: u64) -> Result<(), String> {
    let item = ctx.db.itinerary_item().id().find(item_id)
        .ok_or("Item not found")?;

    require_member(ctx, item.trip_id)?;
    ctx.db.itinerary_item().id().delete(item_id);

    Ok(())
}

#[reducer]
pub fn toggle_visited(ctx: &ReducerContext, item_id: u64) -> Result<(), String> {
    let mut item = ctx.db.itinerary_item().id().find(item_id)
        .ok_or("Item not found")?;

    require_member(ctx, item.trip_id)?;
    item.visited = !item.visited;
    ctx.db.itinerary_item().id().update(item);

    Ok(())
}

#[reducer]
pub fn delete_trip_items(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    let items: Vec<_> = ctx.db.itinerary_item().trip_id().filter(trip_id).collect();
    for item in items {
        ctx.db.itinerary_item().id().delete(item.id);
    }

    Ok(())
}

#[reducer]
pub fn delete_trip_day_metas(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    let metas: Vec<_> = ctx.db.trip_day_meta().trip_id().filter(trip_id).collect();
    for meta in metas {
        ctx.db.trip_day_meta().id().delete(meta.id);
    }

    Ok(())
}

#[reducer]
pub fn upsert_day_meta(
    ctx: &ReducerContext,
    trip_id: u64,
    day: u32,
    title: String,
    summary: String,
    warning: String,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    let existing = ctx.db.trip_day_meta()
        .trip_id()
        .filter(trip_id)
        .find(|dm| dm.day == day);

    if let Some(mut dm) = existing {
        dm.title = title;
        dm.summary = summary;
        dm.warning = warning;
        ctx.db.trip_day_meta().id().update(dm);
    } else {
        ctx.db.trip_day_meta().insert(TripDayMeta {
            id: 0,
            trip_id,
            day,
            title,
            summary,
            warning,
        });
    }

    Ok(())
}

#[reducer]
pub fn update_ai_content(
    ctx: &ReducerContext,
    trip_id: u64,
    tips_json: String,
    arrival_json: String,
    preferences_json: String,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    if ctx.db.trip_ai_content().trip_id().find(trip_id).is_some() {
        ctx.db.trip_ai_content().trip_id().update(TripAiContent {
            trip_id,
            tips_json,
            arrival_json,
            preferences_json,
            updated_at: ctx.timestamp,
        });
    } else {
        ctx.db.trip_ai_content().insert(TripAiContent {
            trip_id,
            tips_json,
            arrival_json,
            preferences_json,
            updated_at: ctx.timestamp,
        });
    }

    Ok(())
}

#[reducer]
pub fn update_presence(
    ctx: &ReducerContext,
    trip_id: u64,
    current_day: u32,
) -> Result<(), String> {
    if let Some(mut p) = ctx.db.presence().identity().find(ctx.sender) {
        p.trip_id = trip_id;
        p.current_day = current_day;
        p.last_seen = ctx.timestamp;
        ctx.db.presence().identity().update(p);
    } else {
        ctx.db.presence().insert(Presence {
            identity: ctx.sender,
            trip_id,
            current_day,
            last_seen: ctx.timestamp,
        });
    }

    Ok(())
}

/// Upsert the caller's live GPS position for a trip.
/// Set is_active = false to stop broadcasting (on "Stop trip").
#[reducer]
pub fn update_live_location(
    ctx: &ReducerContext,
    trip_id: u64,
    lat: f64,
    lng: f64,
    is_active: bool,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    if let Some(mut loc) = ctx.db.live_location().identity().find(ctx.sender) {
        loc.trip_id = trip_id;
        loc.lat = lat;
        loc.lng = lng;
        loc.is_active = is_active;
        loc.updated_at = ctx.timestamp;
        ctx.db.live_location().identity().update(loc);
    } else {
        ctx.db.live_location().insert(LiveLocation {
            identity: ctx.sender,
            trip_id,
            lat,
            lng,
            is_active,
            updated_at: ctx.timestamp,
        });
    }
    Ok(())
}

// ── Place proposals & voting ──────────────────────────────────────────────────

#[reducer]
pub fn propose_place(
    ctx: &ReducerContext,
    trip_id: u64,
    day: u32,
    place_name: String,
    address: String,
    category: String,
    lat: f64,
    lng: f64,
    tip: String,
    is_free: bool,
    cost: String,
    rating: f32,
    review_count: String,
    source: String,
    auto_vote: bool,
) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    // Avoid duplicate proposals for the same place name within a trip.
    let name_lc = place_name.to_lowercase();
    let exists = ctx.db.place_proposal()
        .trip_id()
        .filter(trip_id)
        .any(|p| p.place_name.to_lowercase() == name_lc);
    if exists {
        return Err("This place is already proposed".to_string());
    }

    let proposal = ctx.db.place_proposal().insert(PlaceProposal {
        id: 0,
        trip_id,
        day,
        place_name,
        address,
        category,
        lat,
        lng,
        tip,
        is_free,
        cost,
        rating,
        review_count,
        source,
        proposed_by: ctx.sender,
        created_at: ctx.timestamp,
    });

    // When the place is added directly (search-and-add), the proposer auto-votes
    // Yes. AI recommendations start neutral so the group can vote freely.
    if auto_vote {
        ctx.db.place_vote().insert(PlaceVote {
            id: 0,
            proposal_id: proposal.id,
            trip_id,
            identity: ctx.sender,
            vote: true,
            voted_at: ctx.timestamp,
        });
    }

    Ok(())
}

#[reducer]
pub fn vote_place(ctx: &ReducerContext, proposal_id: u64, vote: bool) -> Result<(), String> {
    let proposal = ctx.db.place_proposal().id().find(proposal_id)
        .ok_or("Proposal not found")?;

    require_member(ctx, proposal.trip_id)?;

    let existing = ctx.db.place_vote()
        .proposal_id()
        .filter(proposal_id)
        .find(|v| v.identity == ctx.sender);

    if let Some(mut v) = existing {
        v.vote = vote;
        v.voted_at = ctx.timestamp;
        ctx.db.place_vote().id().update(v);
    } else {
        ctx.db.place_vote().insert(PlaceVote {
            id: 0,
            proposal_id,
            trip_id: proposal.trip_id,
            identity: ctx.sender,
            vote,
            voted_at: ctx.timestamp,
        });
    }

    Ok(())
}

#[reducer]
pub fn remove_vote(ctx: &ReducerContext, proposal_id: u64) -> Result<(), String> {
    let proposal = ctx.db.place_proposal().id().find(proposal_id)
        .ok_or("Proposal not found")?;

    require_member(ctx, proposal.trip_id)?;

    let existing = ctx.db.place_vote()
        .proposal_id()
        .filter(proposal_id)
        .find(|v| v.identity == ctx.sender);

    if let Some(v) = existing {
        ctx.db.place_vote().id().delete(v.id);
    }

    Ok(())
}

#[reducer]
pub fn remove_proposal(ctx: &ReducerContext, proposal_id: u64) -> Result<(), String> {
    let proposal = ctx.db.place_proposal().id().find(proposal_id)
        .ok_or("Proposal not found")?;

    // Proposer or trip owner may remove it.
    let trip = ctx.db.trip().id().find(proposal.trip_id)
        .ok_or("Trip not found")?;
    if proposal.proposed_by != ctx.sender && trip.owner != ctx.sender {
        return Err("Only the proposer or trip owner can remove this proposal".to_string());
    }

    let votes: Vec<_> = ctx.db.place_vote().proposal_id().filter(proposal_id).collect();
    for v in votes {
        ctx.db.place_vote().id().delete(v.id);
    }
    ctx.db.place_proposal().id().delete(proposal_id);

    Ok(())
}

#[reducer]
pub fn clear_trip_proposals(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    require_member(ctx, trip_id)?;

    let votes: Vec<_> = ctx.db.place_vote().trip_id().filter(trip_id).collect();
    for v in votes {
        ctx.db.place_vote().id().delete(v.id);
    }
    let proposals: Vec<_> = ctx.db.place_proposal().trip_id().filter(trip_id).collect();
    for p in proposals {
        ctx.db.place_proposal().id().delete(p.id);
    }

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn require_member(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    let is_member = ctx.db.trip_member()
        .trip_id()
        .filter(trip_id)
        .any(|m| m.identity == ctx.sender);

    if is_member {
        Ok(())
    } else {
        Err("Not a member of this trip".to_string())
    }
}

fn require_owner(ctx: &ReducerContext, trip_id: u64) -> Result<(), String> {
    let trip = ctx.db.trip().id().find(trip_id)
        .ok_or("Trip not found")?;

    if trip.owner == ctx.sender {
        Ok(())
    } else {
        Err("Only the trip owner can perform this action".to_string())
    }
}
