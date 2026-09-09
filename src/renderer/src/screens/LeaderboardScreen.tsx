import { useState } from "react";
import { formatDuration } from "@shared/timeline";
import type { AppSnapshot } from "@shared/snapshot";
import {
  Check,
  Crown,
  MailPlus,
  Trophy,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Grouped,
  IconButton,
  TextField,
} from "../components/ui";

export function LeaderboardScreen({ state }: { state: AppSnapshot }) {
  const [email, setEmail] = useState("");
  if (!state.isAuthenticated) {
    return (
      <Card>
        <EmptyState
          title="Your circle is waiting"
          body="Sign in to compare screen time with friends and build a little accountability."
          icon={Trophy}
          action={<Button variant="primary" onClick={() => window.stopscrolling.navigate("account")}>Go to account</Button>}
        />
      </Card>
    );
  }
  const podium = state.leaderboard.entries.slice(0, 3);
  const rest = state.leaderboard.entries.slice(3);
  return (
    <div>
      <header className="page-header">
        <div>
          <div className="page-eyebrow">Community</div>
          <h2>Less screen time, together</h2>
          <p>Celebrate the people making room for more of life. The lowest tracked time leads.</p>
        </div>
        <div className="seg" aria-label="Leaderboard period">
          {(["day", "week"] as const).map((period) => (
            <button
              key={period}
              className={state.leaderboard.period === period ? "active" : ""}
              aria-pressed={state.leaderboard.period === period}
              onClick={() => window.stopscrolling.setLeaderboardPeriod(period)}
            >
              {period === "day" ? "Today" : "This week"}
            </button>
          ))}
        </div>
      </header>

      <div className="leaderboard-grid">
        <div className="stack">
          <Grouped
            title="Leaderboard"
            description={`${state.leaderboard.entries.length} people in your circle`}
            action={<Badge tone="accent"><Crown size={11} aria-hidden="true" /> Lowest time wins</Badge>}
          >
            {state.leaderboard.loading ? <p className="muted">Refreshing rankings…</p> : null}
            {podium.length ? (
              <div className="podium">
                {podium.map((entry) => (
                  <div className="podium-entry" key={entry.user_id}>
                    <span className="avatar">{initials(entry.display_name || entry.email)}</span>
                    <span className="podium-rank">#{entry.rank}</span>
                    <span className="podium-name">{entry.display_name || entry.email}</span>
                    <span className="small muted">{formatDuration(entry.total_seconds)}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {rest.map((entry) => (
              <div className={`data-row ranking-row ${entry.is_self ? "is-self" : ""}`} key={entry.user_id}>
                <span className="row-main">
                  <span className="rank-number">#{entry.rank}</span>
                  <span className="avatar">{initials(entry.display_name || entry.email)}</span>
                  <span className="row-copy">
                    <span className="row-title">{entry.display_name || entry.email}</span>
                    <span className="row-subtitle">{entry.is_self ? "You" : entry.email}</span>
                  </span>
                </span>
                <strong className="row-value">{formatDuration(entry.total_seconds)}</strong>
              </div>
            ))}
            {!state.leaderboard.entries.length && !state.leaderboard.loading ? (
              <EmptyState title="No rankings yet" body="Invite a friend to begin your shared reset." icon={Trophy} />
            ) : null}
          </Grouped>
        </div>

        <div className="stack">
          <Grouped title="Invite a friend" description="Add someone by their StopScrolling email">
            <form
              className="form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!email.trim()) return;
                window.stopscrolling.friendsSend(email);
                setEmail("");
              }}
            >
              <TextField
                label="Email address"
                type="email"
                placeholder="friend@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" variant="primary" icon={MailPlus}>Send invite</Button>
            </form>
          </Grouped>

          {state.leaderboard.requests.length ? (
            <Grouped title="Incoming requests" description="People who want to connect">
              {state.leaderboard.requests.map((request) => (
                <div className="friend-request" key={request.request_id}>
                  <div className="data-row">
                    <span className="row-main">
                      <span className="avatar">{initials(request.from_user.display_name || request.from_user.email)}</span>
                      <span className="row-copy">
                        <span className="row-title">{request.from_user.display_name || request.from_user.email}</span>
                        <span className="row-subtitle">{request.from_user.email}</span>
                      </span>
                    </span>
                    <span>
                      <IconButton label="Accept request" icon={Check} onClick={() => window.stopscrolling.friendsAccept(request.request_id)} />
                      <IconButton label="Decline request" icon={X} onClick={() => window.stopscrolling.friendsDecline(request.request_id)} />
                    </span>
                  </div>
                </div>
              ))}
            </Grouped>
          ) : null}

          <Grouped title="Friends" description={`${state.leaderboard.friends.length} connected`}>
            {state.leaderboard.friends.map((friend) => (
              <div className="data-row" key={friend.user_id}>
                <span className="row-main">
                  <span className="avatar">{initials(friend.display_name || friend.email)}</span>
                  <span className="row-copy">
                    <span className="row-title">{friend.display_name || friend.email}</span>
                    <span className="row-subtitle">{friend.email}</span>
                  </span>
                </span>
                <IconButton label={`Remove ${friend.display_name || friend.email}`} icon={X} onClick={() => window.stopscrolling.friendsRemove(friend.user_id)} />
              </div>
            ))}
            {!state.leaderboard.friends.length ? (
              <EmptyState title="No friends yet" body="Invite someone to join your circle." icon={Users} />
            ) : null}
          </Grouped>
        </div>
      </div>
    </div>
  );
}

function initials(value: string) {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "SS";
}
