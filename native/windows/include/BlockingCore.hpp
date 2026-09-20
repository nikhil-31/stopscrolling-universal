#pragma once

#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace stopscrolling {

enum class Mode { normal, strict };

struct AppIdentity {
  std::optional<std::string> publisherThumbprint;
  std::optional<std::string> packageFamilyName;
  std::optional<std::string> executablePath;
};

struct Occurrence {
  std::string id;
  std::int64_t startsAt{};
  std::int64_t endsAt{};
  Mode mode{Mode::normal};
  std::vector<std::string> domains;
  std::vector<AppIdentity> applications;
};

struct Policy {
  int schemaVersion{};
  std::uint64_t policyVersion{};
  std::string deviceID;
  std::int64_t issuedAt{};
  std::int64_t expiresAt{};
  std::vector<Occurrence> occurrences;
};

struct BypassToken {
  std::string occurrenceID;
  std::string deviceID;
  std::string nonce;
  std::int64_t issuedAt{};
  std::int64_t expiresAt{};
};

struct SignedEnvelope {
  std::string payload;
  std::string signature;
  std::string keyID;
};

struct ActiveOccurrence {
  Occurrence occurrence;
  std::uint64_t startTickMs{};
  std::uint64_t endTickMs{};
};

struct PersistedState {
  std::optional<SignedEnvelope> policy;
  std::uint64_t highestPolicyVersion{};
  std::map<std::string, std::int64_t> redeemedNonces;
};

class ProtocolError final : public std::runtime_error {
 public:
  using std::runtime_error::runtime_error;
};

class StateStore {
 public:
  virtual ~StateStore() = default;
  virtual PersistedState load() = 0;
  virtual void save(const PersistedState& state) = 0;
};

using SignatureVerifier =
    std::function<bool(const std::string& keyID, const std::vector<std::uint8_t>& payload,
                       const std::vector<std::uint8_t>& signature)>;

std::vector<std::uint8_t> decodeBase64(const std::string& value);
Policy verifyPolicy(const SignedEnvelope&, std::int64_t now, const SignatureVerifier&);
BypassToken verifyBypass(const SignedEnvelope&, std::int64_t now, const SignatureVerifier&);
std::optional<std::string> normalizeDomain(const std::string&);
bool domainMatches(const std::string& candidate, const std::string& blocked);
std::string canonicalWindowsPath(const std::string&);
bool appMatches(const AppIdentity& candidate, const AppIdentity& blocked);

class PolicyEngine {
 public:
  PolicyEngine(StateStore&, SignatureVerifier, std::string deviceID);
  void restore(std::int64_t wallNow, std::uint64_t tickNow);
  void apply(const SignedEnvelope&, std::int64_t wallNow, std::uint64_t tickNow);
  void redeem(const SignedEnvelope&, std::int64_t wallNow, std::uint64_t tickNow);
  void cancelNormal(const std::string& occurrenceID);
  std::vector<Occurrence> active(std::uint64_t tickNow) const;
  bool hasActiveStrict(std::uint64_t tickNow) const;
  std::optional<std::uint64_t> strictDeadline(std::uint64_t tickNow) const;
  std::optional<std::uint64_t> policyVersion() const;

 private:
  void installDeadlines(std::int64_t wallNow, std::uint64_t tickNow);
  StateStore& store_;
  SignatureVerifier verifySignature_;
  std::string deviceID_;
  PersistedState persisted_;
  std::optional<Policy> policy_;
  std::vector<ActiveOccurrence> deadlines_;
  std::set<std::string> cancelledNormal_;
  std::set<std::string> bypassed_;
};

}  // namespace stopscrolling
