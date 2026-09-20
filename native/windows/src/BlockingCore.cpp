#include "BlockingCore.hpp"

#include <algorithm>
#include <array>
#include <cctype>
#include <filesystem>
#include <limits>
#include <nlohmann/json.hpp>

namespace stopscrolling {
namespace {
using json = nlohmann::json;

void rejectNonIntegerNumbers(const json& value) {
  if (value.is_number_float()) throw ProtocolError("nonCanonicalPayload");
  if (value.is_array()) {
    for (const auto& child : value) rejectNonIntegerNumbers(child);
  } else if (value.is_object()) {
    for (const auto& [_, child] : value.items()) rejectNonIntegerNumbers(child);
  }
}

json canonicalPayload(const SignedEnvelope& envelope, const SignatureVerifier& verifier) {
  const auto bytes = decodeBase64(envelope.payload);
  const auto signature = decodeBase64(envelope.signature);
  if (!verifier(envelope.keyID, bytes, signature)) throw ProtocolError("invalidSignature");
  const std::string text(bytes.begin(), bytes.end());
  json value;
  try {
    value = json::parse(text);
  } catch (...) {
    throw ProtocolError("malformedEnvelope");
  }
  rejectNonIntegerNumbers(value);
  if (value.dump() != text) throw ProtocolError("nonCanonicalPayload");
  return value;
}

std::int64_t parseUtcTimestamp(const std::string& value) {
  // Backend contract: YYYY-MM-DDTHH:MM:SS[.ffffff]Z.
  if (value.size() < 20 || value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
      value[13] != ':' || value[16] != ':' || value.back() != 'Z')
    throw ProtocolError("malformedEnvelope");
  const int year = std::stoi(value.substr(0, 4));
  const unsigned month = static_cast<unsigned>(std::stoi(value.substr(5, 2)));
  const unsigned day = static_cast<unsigned>(std::stoi(value.substr(8, 2)));
  const int hour = std::stoi(value.substr(11, 2));
  const int minute = std::stoi(value.substr(14, 2));
  const int second = std::stoi(value.substr(17, 2));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60)
    throw ProtocolError("malformedEnvelope");
  const int adjustedYear = year - (month <= 2);
  const int era = (adjustedYear >= 0 ? adjustedYear : adjustedYear - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(adjustedYear - era * 400);
  const unsigned dayOfYear =
      (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1;
  const unsigned dayOfEra =
      yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  const auto days = static_cast<std::int64_t>(era) * 146097 +
                    static_cast<std::int64_t>(dayOfEra) - 719468;
  return days * 86400 + hour * 3600 + minute * 60 + second;
}

Policy parsePolicy(const json& value) {
  try {
    Policy policy;
    if (value.at("algorithm") != "Ed25519") throw ProtocolError("unsupportedSchema");
    policy.schemaVersion = 1;
    policy.policyVersion = value.at("policy_version").get<std::uint64_t>();
    policy.deviceID = value.at("device_id").get<std::string>();
    policy.issuedAt = parseUtcTimestamp(value.at("server_time").get<std::string>());
    policy.expiresAt = parseUtcTimestamp(value.at("expires_at").get<std::string>());
    for (const auto& item : value.at("occurrences")) {
      Occurrence occurrence;
      occurrence.id = item.at("occurrence_id").get<std::string>();
      occurrence.startsAt = parseUtcTimestamp(item.at("start_at").get<std::string>());
      occurrence.endsAt = parseUtcTimestamp(item.at("end_at").get<std::string>());
      occurrence.mode = item.at("strict_mode").get<bool>() ? Mode::strict : Mode::normal;
      for (const auto& entry : item.at("entries")) {
        const auto kind = entry.at("entry_type").get<std::string>();
        const auto identifier = entry.at("identifier").get<std::string>();
        if (kind == "website") occurrence.domains.push_back(identifier);
        else if (kind == "app")
          occurrence.applications.push_back(
              AppIdentity{std::nullopt, identifier, std::nullopt});
        else
          throw ProtocolError("malformedEnvelope");
      }
      policy.occurrences.push_back(std::move(occurrence));
    }
    return policy;
  } catch (const ProtocolError&) {
    throw;
  } catch (...) {
    throw ProtocolError("malformedEnvelope");
  }
}

std::uint64_t deadlineTick(std::int64_t deadline, std::int64_t wallNow, std::uint64_t tickNow) {
  if (deadline <= wallNow) return tickNow;
  const auto seconds = static_cast<std::uint64_t>(deadline - wallNow);
  if (seconds > (std::numeric_limits<std::uint64_t>::max() - tickNow) / 1000)
    return std::numeric_limits<std::uint64_t>::max();
  return tickNow + seconds * 1000;
}

std::string lower(std::string value) {
  std::transform(value.begin(), value.end(), value.begin(),
                 [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  return value;
}
}  // namespace

std::vector<std::uint8_t> decodeBase64(const std::string& value) {
  static constexpr unsigned char invalid = 0xff;
  static const auto table = [] {
    std::array<unsigned char, 256> result{};
    result.fill(invalid);
    const std::string alphabet =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (std::size_t i = 0; i < alphabet.size(); ++i)
      result[static_cast<unsigned char>(alphabet[i])] = static_cast<unsigned char>(i);
    return result;
  }();
  if (value.empty() || value.size() % 4 != 0) throw ProtocolError("malformedEnvelope");
  std::vector<std::uint8_t> out;
  out.reserve(value.size() / 4 * 3);
  for (std::size_t i = 0; i < value.size(); i += 4) {
    const bool pad2 = value[i + 2] == '=';
    const bool pad3 = value[i + 3] == '=';
    if (pad2 && !pad3) throw ProtocolError("malformedEnvelope");
    if ((pad2 || pad3) && i + 4 != value.size()) throw ProtocolError("malformedEnvelope");
    const auto a = table[static_cast<unsigned char>(value[i])];
    const auto b = table[static_cast<unsigned char>(value[i + 1])];
    const auto c = pad2 ? 0 : table[static_cast<unsigned char>(value[i + 2])];
    const auto d = pad3 ? 0 : table[static_cast<unsigned char>(value[i + 3])];
    if (a == invalid || b == invalid || c == invalid || d == invalid)
      throw ProtocolError("malformedEnvelope");
    const std::uint32_t bits = (a << 18) | (b << 12) | (c << 6) | d;
    out.push_back(static_cast<std::uint8_t>(bits >> 16));
    if (!pad2) out.push_back(static_cast<std::uint8_t>(bits >> 8));
    if (!pad3) out.push_back(static_cast<std::uint8_t>(bits));
  }
  return out;
}

Policy verifyPolicy(const SignedEnvelope& envelope, std::int64_t now,
                    const SignatureVerifier& verifier) {
  const auto payload = canonicalPayload(envelope, verifier);
  if (payload.value("kid", "") != envelope.keyID) throw ProtocolError("unknownKey");
  auto policy = parsePolicy(payload);
  if (policy.schemaVersion != 1) throw ProtocolError("unsupportedSchema");
  if (policy.issuedAt > now) throw ProtocolError("notYetValid");
  if (policy.expiresAt <= now) throw ProtocolError("expired");
  for (const auto& occurrence : policy.occurrences) {
    if (occurrence.id.empty() || occurrence.endsAt <= occurrence.startsAt)
      throw ProtocolError("malformedEnvelope");
    for (const auto& domain : occurrence.domains)
      if (!normalizeDomain(domain)) throw ProtocolError("malformedEnvelope");
  }
  return policy;
}

BypassToken verifyBypass(const SignedEnvelope& envelope, std::int64_t now,
                         const SignatureVerifier& verifier) {
  try {
    const auto value = canonicalPayload(envelope, verifier);
    if (value.at("type") != "blocking_bypass" || value.at("action") != "disable_blocking" ||
        value.at("kid") != envelope.keyID)
      throw ProtocolError("malformedEnvelope");
    BypassToken token{value.at("occurrence_id").get<std::string>(),
                      value.at("device_id").get<std::string>(),
                      value.at("nonce").get<std::string>(),
                      parseUtcTimestamp(value.at("issued_at").get<std::string>()),
                      parseUtcTimestamp(value.at("expires_at").get<std::string>())};
    if (token.nonce.empty()) throw ProtocolError("malformedEnvelope");
    if (token.issuedAt > now) throw ProtocolError("notYetValid");
    if (token.expiresAt <= now) throw ProtocolError("expired");
    return token;
  } catch (const ProtocolError&) {
    throw;
  } catch (...) {
    throw ProtocolError("malformedEnvelope");
  }
}

std::optional<std::string> normalizeDomain(const std::string& raw) {
  auto value = lower(raw);
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.front()))) value.erase(0, 1);
  while (!value.empty() && std::isspace(static_cast<unsigned char>(value.back()))) value.pop_back();
  if (!value.empty() && value.back() == '.') value.pop_back();
  if (value.empty() || value.size() > 253 || value.find("..") != std::string::npos) return std::nullopt;
  if (!std::all_of(value.begin(), value.end(), [](unsigned char c) {
        return std::isalnum(c) || c == '.' || c == '-';
      }))
    return std::nullopt;
  return value;
}

bool domainMatches(const std::string& candidate, const std::string& blocked) {
  const auto a = normalizeDomain(candidate);
  const auto b = normalizeDomain(blocked);
  return a && b && (*a == *b || (a->size() > b->size() &&
                                 a->compare(a->size() - b->size(), b->size(), *b) == 0 &&
                                 (*a)[a->size() - b->size() - 1] == '.'));
}

std::string canonicalWindowsPath(const std::string& input) {
  auto portable = input;
  std::replace(portable.begin(), portable.end(), '\\', '/');
  auto path = std::filesystem::path(portable).lexically_normal().generic_string();
  return lower(path);
}

bool appMatches(const AppIdentity& candidate, const AppIdentity& blocked) {
  if (blocked.publisherThumbprint && candidate.publisherThumbprint &&
      lower(*blocked.publisherThumbprint) == lower(*candidate.publisherThumbprint))
    return true;
  if (blocked.packageFamilyName && candidate.packageFamilyName &&
      lower(*blocked.packageFamilyName) == lower(*candidate.packageFamilyName))
    return true;
  return blocked.executablePath && candidate.executablePath &&
         canonicalWindowsPath(*blocked.executablePath) == canonicalWindowsPath(*candidate.executablePath);
}

PolicyEngine::PolicyEngine(StateStore& store, SignatureVerifier verifier, std::string deviceID)
    : store_(store), verifySignature_(std::move(verifier)), deviceID_(std::move(deviceID)),
      persisted_(store.load()) {}

void PolicyEngine::restore(std::int64_t wallNow, std::uint64_t tickNow) {
  persisted_ = store_.load();
  if (!persisted_.policy) return;
  auto verified = verifyPolicy(*persisted_.policy, wallNow, verifySignature_);
  if (verified.deviceID != deviceID_) throw ProtocolError("wrongDevice");
  policy_ = std::move(verified);
  installDeadlines(wallNow, tickNow);
}

void PolicyEngine::apply(const SignedEnvelope& envelope, std::int64_t wallNow,
                         std::uint64_t tickNow) {
  auto verified = verifyPolicy(envelope, wallNow, verifySignature_);
  if (verified.deviceID != deviceID_) throw ProtocolError("wrongDevice");
  if (verified.policyVersion <= persisted_.highestPolicyVersion) throw ProtocolError("stalePolicy");
  auto next = persisted_;
  next.policy = envelope;
  next.highestPolicyVersion = verified.policyVersion;
  store_.save(next);
  persisted_ = std::move(next);
  policy_ = std::move(verified);
  cancelledNormal_.clear();
  bypassed_.clear();
  installDeadlines(wallNow, tickNow);
}

void PolicyEngine::redeem(const SignedEnvelope& envelope, std::int64_t wallNow,
                          std::uint64_t) {
  const auto token = verifyBypass(envelope, wallNow, verifySignature_);
  if (token.deviceID != deviceID_) throw ProtocolError("wrongDevice");
  if (!policy_ || std::none_of(policy_->occurrences.begin(), policy_->occurrences.end(),
                               [&](const auto& value) { return value.id == token.occurrenceID; }))
    throw ProtocolError("malformedEnvelope");
  auto next = persisted_;
  std::erase_if(next.redeemedNonces, [&](const auto& item) { return item.second <= wallNow; });
  if (next.redeemedNonces.contains(token.nonce)) throw ProtocolError("replayedNonce");
  next.redeemedNonces[token.nonce] = token.expiresAt;
  store_.save(next);
  persisted_ = std::move(next);
  bypassed_.insert(token.occurrenceID);
}

void PolicyEngine::cancelNormal(const std::string& occurrenceID) {
  if (policy_ && std::any_of(policy_->occurrences.begin(), policy_->occurrences.end(),
                             [&](const auto& value) {
                               return value.id == occurrenceID && value.mode == Mode::normal;
                             }))
    cancelledNormal_.insert(occurrenceID);
}

std::vector<Occurrence> PolicyEngine::active(std::uint64_t tickNow) const {
  std::vector<Occurrence> result;
  for (const auto& deadline : deadlines_) {
    const auto& item = deadline.occurrence;
    if (tickNow >= deadline.startTickMs && tickNow < deadline.endTickMs &&
        !bypassed_.contains(item.id) &&
        !(item.mode == Mode::normal && cancelledNormal_.contains(item.id)))
      result.push_back(item);
  }
  return result;
}

bool PolicyEngine::hasActiveStrict(std::uint64_t tickNow) const {
  return strictDeadline(tickNow).has_value();
}

std::optional<std::uint64_t> PolicyEngine::strictDeadline(std::uint64_t tickNow) const {
  std::optional<std::uint64_t> result;
  for (const auto& deadline : deadlines_) {
    if (deadline.occurrence.mode == Mode::strict &&
        tickNow >= deadline.startTickMs && tickNow < deadline.endTickMs &&
        !bypassed_.contains(deadline.occurrence.id))
      result = std::max(result.value_or(0), deadline.endTickMs);
  }
  return result;
}

std::optional<std::uint64_t> PolicyEngine::policyVersion() const {
  return policy_ ? std::optional(policy_->policyVersion) : std::nullopt;
}

void PolicyEngine::installDeadlines(std::int64_t wallNow, std::uint64_t tickNow) {
  deadlines_.clear();
  for (const auto& occurrence : policy_->occurrences)
    deadlines_.push_back({occurrence, deadlineTick(occurrence.startsAt, wallNow, tickNow),
                          deadlineTick(occurrence.endsAt, wallNow, tickNow)});
}

}  // namespace stopscrolling
