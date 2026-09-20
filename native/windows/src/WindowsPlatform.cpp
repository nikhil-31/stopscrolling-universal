#ifdef _WIN32
#include "WindowsPlatform.hpp"

#include "BuildConfig.hpp"

#include <appmodel.h>
#include <aclapi.h>
#include <fwpmu.h>
#include <ip2string.h>
#include <nlohmann/json.hpp>
#include <psapi.h>
#include <sddl.h>
#include <shlobj.h>
#include <softpub.h>
#include <tlhelp32.h>
#include <wincrypt.h>
#include <wintrust.h>
#include <ws2tcpip.h>
#include <sodium.h>

#include <algorithm>
#include <array>
#include <fstream>
#include <set>
#include <sstream>

namespace stopscrolling::windows {
namespace {
using json = nlohmann::json;

// Product-owned WFP objects. Never reuse third-party provider GUIDs.
const GUID kProvider = {0xbd4acc8e, 0x2a77, 0x4dcf, {0xa3, 0xcc, 0xd7, 0xad, 0x89, 0x3d, 0xa3, 0x11}};
const GUID kSublayer = {0xef7283ec, 0xfbc2, 0x47db, {0x98, 0xe4, 0xd9, 0xe4, 0x29, 0xba, 0xc1, 0x51}};
constexpr wchar_t kStateAcl[] = L"D:P(A;;FA;;;SY)(A;;FA;;;BA)";
constexpr wchar_t kPipeAcl[] = L"D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GRGW;;;AU)";

void check(DWORD result, const char* what) {
  if (result != ERROR_SUCCESS) throw std::system_error(result, std::system_category(), what);
}

std::wstring widen(const std::string& input) {
  if (input.empty()) return {};
  const int count = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, input.data(),
                                        static_cast<int>(input.size()), nullptr, 0);
  if (!count) throw ProtocolError("invalidUtf8");
  std::wstring output(count, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, input.data(),
                      static_cast<int>(input.size()), output.data(), count);
  return output;
}

std::string narrow(const std::wstring& input) {
  if (input.empty()) return {};
  const int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, input.data(),
                                        static_cast<int>(input.size()), nullptr, 0, nullptr, nullptr);
  std::string output(count, '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, input.data(),
                      static_cast<int>(input.size()), output.data(), count, nullptr, nullptr);
  return output;
}

std::string base64(const std::vector<std::uint8_t>& bytes) {
  DWORD length = 0;
  CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()),
                       CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &length);
  std::string output(length, '\0');
  if (!CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()),
                            CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, output.data(), &length))
    throw std::system_error(GetLastError(), std::system_category());
  output.resize(length);
  return output;
}

json envelopeJson(const SignedEnvelope& value) {
  return {{"keyID", value.keyID}, {"payload", value.payload}, {"signature", value.signature}};
}

SignedEnvelope parseEnvelope(const json& value) {
  return {value.at("payload").get<std::string>(), value.at("signature").get<std::string>(),
          value.at("keyID").get<std::string>()};
}

void secureDirectory(const std::filesystem::path& path) {
  std::filesystem::create_directories(path);
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  PACL dacl = nullptr;
  check(ConvertStringSecurityDescriptorToSecurityDescriptorW(
            kStateAcl, SDDL_REVISION_1, &descriptor, nullptr)
            ? ERROR_SUCCESS
            : GetLastError(),
        "state security descriptor");
  BOOL present = FALSE, defaulted = FALSE;
  GetSecurityDescriptorDacl(descriptor, &present, &dacl, &defaulted);
  const auto result = SetNamedSecurityInfoW(
      const_cast<wchar_t*>(path.c_str()), SE_FILE_OBJECT,
      DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr, nullptr, dacl, nullptr);
  LocalFree(descriptor);
  check(result, "secure ProgramData directory");
}

void validateSecureStateFile(const std::filesystem::path& path) {
  const auto attributes = GetFileAttributesW(path.c_str());
  if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_REPARSE_POINT))
    throw ProtocolError("insecureState");
  PSID owner = nullptr;
  PACL dacl = nullptr;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  check(GetNamedSecurityInfoW(const_cast<wchar_t*>(path.c_str()), SE_FILE_OBJECT,
                              OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
                              &owner, nullptr, &dacl, nullptr, &descriptor),
        "read state security");
  BYTE systemSid[SECURITY_MAX_SID_SIZE]{}, administratorsSid[SECURITY_MAX_SID_SIZE]{};
  DWORD systemSize = sizeof(systemSid), administratorsSize = sizeof(administratorsSid);
  CreateWellKnownSid(WinLocalSystemSid, nullptr, systemSid, &systemSize);
  CreateWellKnownSid(WinBuiltinAdministratorsSid, nullptr, administratorsSid, &administratorsSize);
  bool valid = owner && (EqualSid(owner, systemSid) || EqualSid(owner, administratorsSid));
  SECURITY_DESCRIPTOR_CONTROL control{};
  DWORD revision = 0;
  valid = valid && GetSecurityDescriptorControl(descriptor, &control, &revision) &&
          (control & SE_DACL_PROTECTED);
  for (const auto type : {WinWorldSid, WinAuthenticatedUserSid, WinBuiltinUsersSid}) {
    if (!dacl) {
      valid = false;
      break;
    }
    BYTE sid[SECURITY_MAX_SID_SIZE]{};
    DWORD sidSize = sizeof(sid);
    if (!CreateWellKnownSid(type, nullptr, sid, &sidSize)) {
      valid = false;
      break;
    }
    TRUSTEE_W trustee{};
    BuildTrusteeWithSidW(&trustee, sid);
    ACCESS_MASK rights = 0;
    if (GetEffectiveRightsFromAclW(dacl, &trustee, &rights) != ERROR_SUCCESS ||
        (rights & (FILE_WRITE_DATA | FILE_APPEND_DATA | WRITE_DAC | WRITE_OWNER | DELETE))) {
      valid = false;
      break;
    }
  }
  LocalFree(descriptor);
  if (!valid) throw ProtocolError("insecureState");
}

std::optional<std::wstring> processPath(DWORD pid) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return std::nullopt;
  std::wstring value(32768, L'\0');
  DWORD size = static_cast<DWORD>(value.size());
  const BOOL ok = QueryFullProcessImageNameW(process, 0, value.data(), &size);
  CloseHandle(process);
  if (!ok) return std::nullopt;
  value.resize(size);
  return value;
}

std::optional<std::string> packageFamily(DWORD pid) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (!process) return std::nullopt;
  UINT32 length = 0;
  const auto first = GetPackageFamilyName(process, &length, nullptr);
  if (first != ERROR_INSUFFICIENT_BUFFER) {
    CloseHandle(process);
    return std::nullopt;
  }
  std::wstring value(length, L'\0');
  const auto result = GetPackageFamilyName(process, &length, value.data());
  CloseHandle(process);
  if (result != ERROR_SUCCESS) return std::nullopt;
  if (!value.empty() && value.back() == L'\0') value.pop_back();
  return narrow(value);
}

std::wstring certificateThumbprint(const std::wstring& path) {
  WINTRUST_FILE_INFO file{sizeof(file)};
  file.pcwszFilePath = path.c_str();
  WINTRUST_DATA trust{sizeof(trust)};
  trust.dwUIChoice = WTD_UI_NONE;
  trust.fdwRevocationChecks = WTD_REVOKE_WHOLECHAIN;
  trust.dwUnionChoice = WTD_CHOICE_FILE;
  trust.pFile = &file;
  trust.dwStateAction = WTD_STATEACTION_VERIFY;
  GUID action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
  if (WinVerifyTrust(nullptr, &action, &trust) != ERROR_SUCCESS) return {};

  std::wstring result;
  auto* provider = WTHelperProvDataFromStateData(trust.hWVTStateData);
  auto* signer = provider ? WTHelperGetProvSignerFromChain(provider, 0, FALSE, 0) : nullptr;
  auto* cert = signer ? WTHelperGetProvCertFromChain(signer, 0) : nullptr;
  if (cert && cert->pCert) {
    std::array<BYTE, 32> hash{};
    DWORD size = static_cast<DWORD>(hash.size());
    if (CertGetCertificateContextProperty(cert->pCert, CERT_SHA256_HASH_PROP_ID, hash.data(), &size)) {
      static constexpr wchar_t hex[] = L"0123456789ABCDEF";
      for (DWORD i = 0; i < size; ++i) {
        result += hex[hash[i] >> 4];
        result += hex[hash[i] & 15];
      }
    }
  }
  trust.dwStateAction = WTD_STATEACTION_CLOSE;
  WinVerifyTrust(nullptr, &action, &trust);
  return result;
}

void ensureWfpObjects(HANDLE engine) {
  FWPM_PROVIDER0 provider{};
  provider.providerKey = kProvider;
  provider.displayData.name = const_cast<wchar_t*>(L"Stop Scrolling");
  provider.flags = FWPM_PROVIDER_FLAG_PERSISTENT;
  auto result = FwpmProviderAdd0(engine, &provider, nullptr);
  if (result != ERROR_SUCCESS && result != FWP_E_ALREADY_EXISTS) check(result, "add WFP provider");

  FWPM_SUBLAYER0 layer{};
  layer.subLayerKey = kSublayer;
  layer.displayData.name = const_cast<wchar_t*>(L"Stop Scrolling website blocking");
  layer.providerKey = const_cast<GUID*>(&kProvider);
  layer.flags = FWPM_SUBLAYER_FLAG_PERSISTENT;
  layer.weight = 0x7f00;
  result = FwpmSubLayerAdd0(engine, &layer, nullptr);
  if (result != ERROR_SUCCESS && result != FWP_E_ALREADY_EXISTS) check(result, "add WFP sublayer");
}

void deleteProductFilters(HANDLE engine) {
  FWPM_FILTER_ENUM_TEMPLATE0 query{};
  query.providerKey = const_cast<GUID*>(&kProvider);
  HANDLE enumeration = nullptr;
  check(FwpmFilterCreateEnumHandle0(engine, &query, &enumeration), "enumerate WFP filters");
  for (;;) {
    FWPM_FILTER0** filters = nullptr;
    UINT32 count = 0;
    check(FwpmFilterEnum0(engine, enumeration, 128, &filters, &count), "read WFP filters");
    for (UINT32 i = 0; i < count; ++i) FwpmFilterDeleteById0(engine, filters[i]->filterId);
    FwpmFreeMemory0(reinterpret_cast<void**>(&filters));
    if (count == 0) break;
  }
  FwpmFilterDestroyEnumHandle0(engine, enumeration);
}

void addFqdnFilter(HANDLE engine, const GUID& layer, const std::wstring& domain) {
  const auto byteCount = static_cast<UINT32>((domain.size() + 1) * sizeof(wchar_t));
  FWP_BYTE_BLOB blob{byteCount, reinterpret_cast<UINT8*>(const_cast<wchar_t*>(domain.c_str()))};
  FWPM_FILTER_CONDITION0 condition{};
  condition.fieldKey = FWPM_CONDITION_ALE_REMOTE_FQDN;
  condition.matchType = FWP_MATCH_EQUAL;
  condition.conditionValue.type = FWP_BYTE_BLOB_TYPE;
  condition.conditionValue.byteBlob = &blob;
  FWPM_FILTER0 filter{};
  filter.displayData.name = const_cast<wchar_t*>(L"Stop Scrolling domain");
  filter.providerKey = const_cast<GUID*>(&kProvider);
  filter.subLayerKey = kSublayer;
  filter.layerKey = layer;
  filter.weight.type = FWP_EMPTY;
  filter.action.type = FWP_ACTION_BLOCK;
  filter.flags = FWPM_FILTER_FLAG_PERSISTENT | FWPM_FILTER_FLAG_CLEAR_ACTION_RIGHT;
  filter.numFilterConditions = 1;
  filter.filterCondition = &condition;
  check(FwpmFilterAdd0(engine, &filter, nullptr, nullptr), "add FQDN filter");
}

void addResolvedAddressFilters(HANDLE engine, const std::wstring& domain) {
  ADDRINFOW hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  ADDRINFOW* addresses = nullptr;
  if (GetAddrInfoW(domain.c_str(), nullptr, &hints, &addresses) != 0) return;
  for (auto* item = addresses; item; item = item->ai_next) {
    FWPM_FILTER_CONDITION0 condition{};
    condition.fieldKey = FWPM_CONDITION_IP_REMOTE_ADDRESS;
    condition.matchType = FWP_MATCH_EQUAL;
    FWP_BYTE_ARRAY16 ipv6{};
    if (item->ai_family == AF_INET) {
      condition.conditionValue.type = FWP_UINT32;
      condition.conditionValue.uint32 =
          ntohl(reinterpret_cast<sockaddr_in*>(item->ai_addr)->sin_addr.s_addr);
    } else if (item->ai_family == AF_INET6) {
      condition.conditionValue.type = FWP_BYTE_ARRAY16_TYPE;
      std::memcpy(ipv6.byteArray16,
                  &reinterpret_cast<sockaddr_in6*>(item->ai_addr)->sin6_addr, 16);
      condition.conditionValue.byteArray16 = &ipv6;
    } else {
      continue;
    }
    FWPM_FILTER0 filter{};
    filter.displayData.name = const_cast<wchar_t*>(L"Stop Scrolling resolved domain address");
    filter.providerKey = const_cast<GUID*>(&kProvider);
    filter.subLayerKey = kSublayer;
    filter.layerKey =
        item->ai_family == AF_INET ? FWPM_LAYER_ALE_AUTH_CONNECT_V4 : FWPM_LAYER_ALE_AUTH_CONNECT_V6;
    filter.action.type = FWP_ACTION_BLOCK;
    filter.flags = FWPM_FILTER_FLAG_PERSISTENT | FWPM_FILTER_FLAG_CLEAR_ACTION_RIGHT;
    filter.weight.type = FWP_EMPTY;
    filter.numFilterConditions = 1;
    filter.filterCondition = &condition;
    check(FwpmFilterAdd0(engine, &filter, nullptr, nullptr), "add address filter");
  }
  FreeAddrInfoW(addresses);
}
}  // namespace

std::filesystem::path programDataDirectory() {
  PWSTR value = nullptr;
  check(SHGetKnownFolderPath(FOLDERID_ProgramData, KF_FLAG_DEFAULT, nullptr, &value),
        "resolve ProgramData");
  const std::filesystem::path result = std::filesystem::path(value) / L"StopScrolling";
  CoTaskMemFree(value);
  return result;
}

std::int64_t unixNow() {
  FILETIME value{};
  GetSystemTimePreciseAsFileTime(&value);
  ULARGE_INTEGER ticks{{value.dwLowDateTime, value.dwHighDateTime}};
  return static_cast<std::int64_t>(ticks.QuadPart / 10'000'000ULL - 11'644'473'600ULL);
}

std::uint64_t monotonicNowMs() { return GetTickCount64(); }

ProgramDataStore::ProgramDataStore() : path_(programDataDirectory() / L"enforcement.json") {
  secureDirectory(path_.parent_path());
}

PersistedState ProgramDataStore::load() {
  std::scoped_lock lock(mutex_);
  if (!std::filesystem::exists(path_)) return {};
  validateSecureStateFile(path_);
  std::ifstream stream(path_, std::ios::binary);
  const auto value = json::parse(stream);
  PersistedState state;
  state.highestPolicyVersion = value.value("highestPolicyVersion", std::uint64_t{0});
  if (value.contains("policy") && !value["policy"].is_null()) state.policy = parseEnvelope(value["policy"]);
  state.redeemedNonces =
      value.value("redeemedNonces", std::map<std::string, std::int64_t>{});
  return state;
}

void ProgramDataStore::save(const PersistedState& state) {
  std::scoped_lock lock(mutex_);
  secureDirectory(path_.parent_path());
  json value{{"highestPolicyVersion", state.highestPolicyVersion},
             {"redeemedNonces", state.redeemedNonces}};
  value["policy"] = state.policy ? envelopeJson(*state.policy) : json(nullptr);
  const auto temporary = path_.wstring() + L".tmp";
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  ConvertStringSecurityDescriptorToSecurityDescriptorW(kStateAcl, SDDL_REVISION_1, &descriptor, nullptr);
  SECURITY_ATTRIBUTES attributes{sizeof(attributes), descriptor, FALSE};
  HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, &attributes, CREATE_ALWAYS,
                            FILE_ATTRIBUTE_HIDDEN | FILE_FLAG_WRITE_THROUGH, nullptr);
  LocalFree(descriptor);
  if (file == INVALID_HANDLE_VALUE) throw std::system_error(GetLastError(), std::system_category());
  const auto bytes = value.dump();
  DWORD written = 0;
  const BOOL wrote = WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written, nullptr);
  const BOOL flushed = wrote && written == bytes.size() && FlushFileBuffers(file);
  CloseHandle(file);
  if (!flushed) {
    DeleteFileW(temporary.c_str());
    throw std::system_error(GetLastError(), std::system_category());
  }
  if (!ReplaceFileW(path_.c_str(), temporary.c_str(), nullptr, REPLACEFILE_WRITE_THROUGH, nullptr, nullptr) &&
      !MoveFileExW(temporary.c_str(), path_.c_str(),
                   MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    DeleteFileW(temporary.c_str());
    throw std::system_error(GetLastError(), std::system_category());
  }
}

SignatureVerifier productionSignatureVerifier() {
  const auto key = decodeBase64(build::kPublicKeyBase64);
  if (key.size() != crypto_sign_PUBLICKEYBYTES || sodium_init() < 0)
    throw ProtocolError("invalidProvisionedKey");
  return [key](const std::string& keyID, const std::vector<std::uint8_t>& payload,
               const std::vector<std::uint8_t>& signature) {
    return keyID == build::kKeyID && signature.size() == crypto_sign_BYTES &&
           crypto_sign_verify_detached(signature.data(), payload.data(),
                                       static_cast<unsigned long long>(payload.size()),
                                       key.data()) == 0;
  };
}

bool authenticatePipeClient(HANDLE pipe) {
  ULONG pid = 0;
  if (!GetNamedPipeClientProcessId(pipe, &pid)) return false;
  const auto path = processPath(pid);
  if (!path) return false;
  const auto thumbprint = certificateThumbprint(*path);
  return !thumbprint.empty() &&
         _wcsicmp(thumbprint.c_str(), build::kClientCertificateSha256) == 0;
}

std::string installedApplicationInventoryJson() {
  json result = json::array();
  const std::array<std::pair<HKEY, const wchar_t*>, 2> roots{{
      {HKEY_LOCAL_MACHINE, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"},
      {HKEY_CURRENT_USER, L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"},
  }};
  for (const auto& [root, path] : roots) {
    HKEY key = nullptr;
    if (RegOpenKeyExW(root, path, 0, KEY_READ | KEY_WOW64_64KEY, &key) != ERROR_SUCCESS) continue;
    for (DWORD index = 0;; ++index) {
      wchar_t child[512]{};
      DWORD childSize = static_cast<DWORD>(std::size(child));
      if (RegEnumKeyExW(key, index, child, &childSize, nullptr, nullptr, nullptr, nullptr) != ERROR_SUCCESS) break;
      HKEY application = nullptr;
      if (RegOpenKeyExW(key, child, 0, KEY_READ, &application) != ERROR_SUCCESS) continue;
      auto read = [&](const wchar_t* name) {
        wchar_t value[32768]{};
        DWORD bytes = sizeof(value), type = 0;
        return RegQueryValueExW(application, name, nullptr, &type,
                                reinterpret_cast<BYTE*>(value), &bytes) == ERROR_SUCCESS &&
                       (type == REG_SZ || type == REG_EXPAND_SZ)
                   ? narrow(value)
                   : std::string{};
      };
      const auto name = read(L"DisplayName");
      const auto location = read(L"InstallLocation");
      auto executable = read(L"DisplayIcon");
      const auto comma = executable.rfind(',');
      if (comma != std::string::npos) executable.resize(comma);
      if (executable.size() >= 2 && executable.front() == '"' && executable.back() == '"')
        executable = executable.substr(1, executable.size() - 2);
      std::string thumbprint;
      std::error_code ignored;
      if (!executable.empty() && std::filesystem::is_regular_file(widen(executable), ignored))
        thumbprint = narrow(certificateThumbprint(widen(executable)));
      if (!name.empty())
        result.push_back({{"displayName", name},
                          {"installLocation", location},
                          {"executablePath", executable.empty() ? json(nullptr) : json(executable)},
                          {"packageFamilyName", nullptr},
                          {"publisherThumbprint",
                           thumbprint.empty() ? json(nullptr) : json(thumbprint)}});
      RegCloseKey(application);
    }
    RegCloseKey(key);
  }

  HKEY packages = nullptr;
  constexpr wchar_t packagePath[] =
      L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Appx\\AppxAllUserStore\\Applications";
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, packagePath, 0, KEY_READ, &packages) == ERROR_SUCCESS) {
    for (DWORD index = 0;; ++index) {
      wchar_t fullName[PACKAGE_FULL_NAME_MAX_LENGTH + 1]{};
      DWORD length = static_cast<DWORD>(std::size(fullName));
      if (RegEnumKeyExW(packages, index, fullName, &length, nullptr, nullptr, nullptr, nullptr) !=
          ERROR_SUCCESS)
        break;
      UINT32 familyLength = 0;
      if (PackageFamilyNameFromFullName(fullName, &familyLength, nullptr) !=
          ERROR_INSUFFICIENT_BUFFER)
        continue;
      std::wstring family(familyLength, L'\0');
      if (PackageFamilyNameFromFullName(fullName, &familyLength, family.data()) != ERROR_SUCCESS)
        continue;
      if (!family.empty() && family.back() == L'\0') family.pop_back();
      result.push_back({{"displayName", narrow(fullName)},
                        {"executablePath", nullptr},
                        {"packageFamilyName", narrow(family)},
                        {"publisherThumbprint", nullptr}});
    }
    RegCloseKey(packages);
  }
  return result.dump();
}

WfpEnforcer::WfpEnforcer() {
  HANDLE value = nullptr;
  check(FwpmEngineOpen0(nullptr, RPC_C_AUTHN_WINNT, nullptr, nullptr, &value), "open WFP engine");
  engine_ = value;
  ensureWfpObjects(value);
}

WfpEnforcer::~WfpEnforcer() {
  if (engine_) FwpmEngineClose0(static_cast<HANDLE>(engine_));
}

void WfpEnforcer::replace(const std::vector<Occurrence>& active) {
  auto engine = static_cast<HANDLE>(engine_);
  check(FwpmTransactionBegin0(engine, 0), "begin WFP replacement");
  try {
    deleteProductFilters(engine);
    std::set<std::string> domains;
    for (const auto& occurrence : active)
      for (const auto& domain : occurrence.domains) domains.insert(*normalizeDomain(domain));
    for (const auto& domain : domains) {
      const auto wide = widen(domain);
      addFqdnFilter(engine, FWPM_LAYER_ALE_AUTH_CONNECT_V4, wide);
      addFqdnFilter(engine, FWPM_LAYER_ALE_AUTH_CONNECT_V6, wide);
      addFqdnFilter(engine, FWPM_LAYER_ALE_AUTH_CONNECT_V4, L"*." + wide);
      addFqdnFilter(engine, FWPM_LAYER_ALE_AUTH_CONNECT_V6, L"*." + wide);
      addResolvedAddressFilters(engine, wide);
    }
    check(FwpmTransactionCommit0(engine), "commit WFP replacement");
  } catch (...) {
    FwpmTransactionAbort0(engine);
    throw;
  }
}

void WfpEnforcer::removeAll(bool removeObjects) {
  auto engine = static_cast<HANDLE>(engine_);
  check(FwpmTransactionBegin0(engine, 0), "begin WFP cleanup");
  try {
    deleteProductFilters(engine);
    if (removeObjects) {
      const auto sublayer = FwpmSubLayerDeleteByKey0(engine, &kSublayer);
      if (sublayer != ERROR_SUCCESS && sublayer != FWP_E_SUBLAYER_NOT_FOUND)
        check(sublayer, "remove WFP sublayer");
      const auto provider = FwpmProviderDeleteByKey0(engine, &kProvider);
      if (provider != ERROR_SUCCESS && provider != FWP_E_PROVIDER_NOT_FOUND)
        check(provider, "remove WFP provider");
    }
    check(FwpmTransactionCommit0(engine), "commit WFP cleanup");
  } catch (...) {
    FwpmTransactionAbort0(engine);
    throw;
  }
}

ProcessWatcher::ProcessWatcher() : worker_([this] { run(); }) {}
ProcessWatcher::~ProcessWatcher() { stop(); }

void ProcessWatcher::replace(const std::vector<Occurrence>& active) {
  std::scoped_lock lock(mutex_);
  blocked_.clear();
  for (const auto& occurrence : active)
    blocked_.insert(blocked_.end(), occurrence.applications.begin(), occurrence.applications.end());
}

void ProcessWatcher::stop() {
  stopping_ = true;
  if (worker_.joinable()) worker_.join();
}

void ProcessWatcher::run() {
  while (!stopping_) {
    std::vector<AppIdentity> blocked;
    {
      std::scoped_lock lock(mutex_);
      blocked = blocked_;
    }
    if (!blocked.empty()) {
      HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
      PROCESSENTRY32W entry{sizeof(entry)};
      if (snapshot != INVALID_HANDLE_VALUE && Process32FirstW(snapshot, &entry)) {
        do {
          const auto path = processPath(entry.th32ProcessID);
          if (!path) continue;
          AppIdentity candidate;
          candidate.executablePath = narrow(*path);
          candidate.packageFamilyName = packageFamily(entry.th32ProcessID);
          const auto thumbprint = certificateThumbprint(*path);
          if (!thumbprint.empty()) candidate.publisherThumbprint = narrow(thumbprint);
          if (std::any_of(blocked.begin(), blocked.end(),
                          [&](const auto& rule) { return appMatches(candidate, rule); })) {
            HANDLE process = OpenProcess(PROCESS_TERMINATE, FALSE, entry.th32ProcessID);
            if (process) {
              TerminateProcess(process, ERROR_ACCESS_DISABLED_BY_POLICY);
              CloseHandle(process);
            }
          }
        } while (Process32NextW(snapshot, &entry));
      }
      if (snapshot != INVALID_HANDLE_VALUE) CloseHandle(snapshot);
    }
    Sleep(40);
  }
}

void writeStrictMarker(std::optional<std::uint64_t> deadlineTickMs) {
  const auto directory = programDataDirectory();
  secureDirectory(directory);
  const auto path = directory / L"strict-active";
  if (!deadlineTickMs) {
    DeleteFileW(path.c_str());
    return;
  }
  // The value is a boot-relative monotonic deadline, never a wall timestamp.
  std::ofstream(path, std::ios::trunc) << *deadlineTickMs;
}

bool strictMarkerActive(std::uint64_t tickNow) {
  std::ifstream input(programDataDirectory() / L"strict-active");
  std::uint64_t deadline = 0;
  return (input >> deadline) && tickNow < deadline;
}

}  // namespace stopscrolling::windows
#endif
