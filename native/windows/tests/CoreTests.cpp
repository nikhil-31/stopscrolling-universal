#include "BlockingCore.hpp"

#include <nlohmann/json.hpp>

#include <cstdlib>
#include <iostream>

using namespace stopscrolling;
using json = nlohmann::json;

namespace {
class MemoryStore final : public StateStore {
 public:
  PersistedState load() override { return state; }
  void save(const PersistedState& next) override { state = next; }
  PersistedState state;
};

void expect(bool condition, const char* message) {
  if (!condition) {
    std::cerr << "FAILED: " << message << '\n';
    std::exit(1);
  }
}

template <typename Function>
void expectError(Function&& function, const char* message) {
  try {
    function();
  } catch (const ProtocolError&) {
    return;
  }
  expect(false, message);
}

std::string encodeBase64(const std::string& input) {
  static constexpr char alphabet[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string output;
  for (std::size_t i = 0; i < input.size(); i += 3) {
    const auto a = static_cast<unsigned char>(input[i]);
    const auto b = i + 1 < input.size() ? static_cast<unsigned char>(input[i + 1]) : 0;
    const auto c = i + 2 < input.size() ? static_cast<unsigned char>(input[i + 2]) : 0;
    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | (b >> 4)];
    output += i + 1 < input.size() ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    output += i + 2 < input.size() ? alphabet[c & 63] : '=';
  }
  return output;
}

SignedEnvelope signedJson(const json& value) {
  return {encodeBase64(value.dump()), "c2ln", "test"};
}

json policy(std::uint64_t version = 1, std::string mode = "strict") {
  return {
      {"algorithm", "Ed25519"},
      {"device_id", "device-1"},
      {"expires_at", "1970-01-01T00:33:20Z"},
      {"kid", "test"},
      {"occurrences",
       {{{"end_at", "1970-01-01T00:18:20Z"},
         {"entries",
          {{{"entry_type", "website"}, {"identifier", "example.com"}, {"label", ""}},
           {{"entry_type", "app"}, {"identifier", "Publisher.App_abc"}, {"label", ""}}}},
         {"occurrence_id", "occurrence-1"},
         {"schedule_id", "schedule-1"},
         {"schedule_name", "Fixture"},
         {"start_at", "1970-01-01T00:16:40Z"},
         {"strict_mode", mode == "strict"}}}},
      {"policy_version", version},
      {"server_time", "1970-01-01T00:15:00Z"},
  };
}

json bypass(std::string nonce = "nonce-1") {
  return {{"action", "disable_blocking"},
          {"device_id", "device-1"},
          {"expires_at", "1970-01-01T00:17:30Z"},
          {"issued_at", "1970-01-01T00:16:40Z"},
          {"kid", "test"},
          {"nonce", nonce},
          {"occurrence_id", "occurrence-1"},
          {"type", "blocking_bypass"}};
}

const SignatureVerifier acceptFixture =
    [](const std::string& key, const auto&, const auto&) { return key == "test"; };

void matchingTests() {
  expect(domainMatches("example.com", "example.com"), "exact domain");
  expect(domainMatches("Deep.WWW.Example.com.", "example.com"), "subdomain");
  expect(!domainMatches("notexample.com", "example.com"), "suffix confusion");
  expect(!domainMatches("example.com.evil.test", "example.com"), "superdomain confusion");

  AppIdentity candidate{std::string("AABB"), std::string("Publisher.App_abc"),
                        std::string("C:\\Program Files\\App\\app.exe")};
  expect(appMatches(candidate, AppIdentity{std::string("aabb"), std::nullopt, std::nullopt}),
         "publisher identity");
  expect(appMatches(candidate, AppIdentity{std::nullopt, std::string("publisher.app_ABC"), std::nullopt}),
         "package family identity");
  expect(appMatches(candidate, AppIdentity{std::nullopt, std::nullopt,
                                           std::string("c:/program files/app/./app.exe")}),
         "canonical path identity");
}

void verificationTests() {
  expect(verifyPolicy(signedJson(policy()), 1000, acceptFixture).policyVersion == 1,
         "valid policy");
  expectError([&] { verifyPolicy(signedJson(policy()), 2000, acceptFixture); }, "expired policy");
  auto noncanonical = signedJson(policy());
  noncanonical.payload = encodeBase64(policy().dump(2));
  expectError([&] { verifyPolicy(noncanonical, 1000, acceptFixture); }, "noncanonical policy");
}

void lifecycleTests() {
  MemoryStore store;
  PolicyEngine strict(store, acceptFixture, "device-1");
  strict.apply(signedJson(policy()), 1000, 500'000);
  expect(strict.hasActiveStrict(500'000), "strict active");
  expect(strict.strictDeadline(500'000) == 600'000, "strict watchdog deadline");
  expect(strict.hasActiveStrict(550'000), "wall changes do not affect anchored deadline");
  expect(!strict.hasActiveStrict(600'000), "strict monotonic expiry");
  expectError([&] { strict.apply(signedJson(policy()), 1000, 500'000); }, "stale version");

  MemoryStore normalStore;
  PolicyEngine normal(normalStore, acceptFixture, "device-1");
  normal.apply(signedJson(policy(1, "normal")), 1000, 700'000);
  expect(normal.active(700'000).size() == 1, "normal active");
  normal.cancelNormal("occurrence-1");
  expect(normal.active(700'000).empty(), "normal cancellable");

  MemoryStore replayStore;
  PolicyEngine replay(replayStore, acceptFixture, "device-1");
  replay.apply(signedJson(policy()), 1000, 500'000);
  replay.redeem(signedJson(bypass()), 1000, 500'000);
  expect(replay.active(500'000).empty(), "bypass ends occurrence");
  expectError([&] { replay.redeem(signedJson(bypass()), 1001, 501'000); }, "nonce replay");

  PolicyEngine restored(replayStore, acceptFixture, "device-1");
  expectError([&] { restored.apply(signedJson(policy()), 1000, 10); },
              "downgrade rejection survives restart");
}
}  // namespace

int main() {
  matchingTests();
  verificationTests();
  lifecycleTests();
  std::cout << "all blocking core tests passed\n";
}
