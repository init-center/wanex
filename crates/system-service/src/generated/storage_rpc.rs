// Generated from schemas/storage-rpc/storage-rpc.schema.json. Do not edit.

#[doc = r" Error types."]
pub mod error {
    #[doc = r" Error from a `TryFrom` or `FromStr` implementation."]
    pub struct ConversionError(::std::borrow::Cow<'static, str>);
    impl ::std::error::Error for ConversionError {}
    impl ::std::fmt::Display for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Display::fmt(&self.0, f)
        }
    }
    impl ::std::fmt::Debug for ConversionError {
        fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> Result<(), ::std::fmt::Error> {
            ::std::fmt::Debug::fmt(&self.0, f)
        }
    }
    impl From<&'static str> for ConversionError {
        fn from(value: &'static str) -> Self {
            Self(value.into())
        }
    }
    impl From<String> for ConversionError {
        fn from(value: String) -> Self {
            Self(value.into())
        }
    }
}
#[doc = "`ActivateContextEpochCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"activate-context-epoch\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ActivateContextEpochWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ActivateContextEpochCommand {
    pub command: ActivateContextEpochCommandCommand,
    pub request: ActivateContextEpochWire,
}
#[doc = "`ActivateContextEpochCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"activate-context-epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ActivateContextEpochCommandCommand {
    #[serde(rename = "activate-context-epoch")]
    ActivateContextEpoch,
}
impl ::std::fmt::Display for ActivateContextEpochCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ActivateContextEpoch => f.write_str("activate-context-epoch"),
        }
    }
}
impl ::std::str::FromStr for ActivateContextEpochCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "activate-context-epoch" => Ok(Self::ActivateContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ActivateContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ActivateContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ActivateContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ActivateContextEpochWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"epoch_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"epoch_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ActivateContextEpochWire {
    pub epoch_id: ::std::string::String,
}
#[doc = "`AdmitSessionInputCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"content\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"input_type\","]
#[doc = "    \"intent\","]
#[doc = "    \"origin\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"admit-session-input\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"content\": {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"input_type\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"user\","]
#[doc = "        \"system\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"intent\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputIntentWire\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputOriginWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AdmitSessionInputCommand {
    pub command: AdmitSessionInputCommandCommand,
    pub content: MessagePartsWire,
    pub id: NullableString,
    pub idempotency_key: ::std::string::String,
    pub input_type: AdmitSessionInputCommandInputType,
    pub intent: NullableSessionInputIntentWire,
    pub origin: NullableSessionInputOriginWire,
    pub principal_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`AdmitSessionInputCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"admit-session-input\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AdmitSessionInputCommandCommand {
    #[serde(rename = "admit-session-input")]
    AdmitSessionInput,
}
impl ::std::fmt::Display for AdmitSessionInputCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AdmitSessionInput => f.write_str("admit-session-input"),
        }
    }
}
impl ::std::str::FromStr for AdmitSessionInputCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "admit-session-input" => Ok(Self::AdmitSessionInput),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AdmitSessionInputCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AdmitSessionInputCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AdmitSessionInputCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AdmitSessionInputCommandInputType`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"user\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AdmitSessionInputCommandInputType {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for AdmitSessionInputCommandInputType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::User => f.write_str("user"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for AdmitSessionInputCommandInputType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "user" => Ok(Self::User),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AdmitSessionInputCommandInputType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AdmitSessionInputCommandInputType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AdmitSessionInputCommandInputType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AppendEventCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"event\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"append-event\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"event\": {"]
#[doc = "      \"$ref\": \"#/$defs/RuntimeEventInputWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AppendEventCommand {
    pub command: AppendEventCommandCommand,
    pub event: RuntimeEventInputWire,
}
#[doc = "`AppendEventCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"append-event\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AppendEventCommandCommand {
    #[serde(rename = "append-event")]
    AppendEvent,
}
impl ::std::fmt::Display for AppendEventCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AppendEvent => f.write_str("append-event"),
        }
    }
}
impl ::std::str::FromStr for AppendEventCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "append-event" => Ok(Self::AppendEvent),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AppendEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AppendEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AppendEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AppendSessionMessageCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"content\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"input_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"role\","]
#[doc = "    \"run_id\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"append-session-message\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"content\": {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"role\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"user\","]
#[doc = "        \"assistant\","]
#[doc = "        \"tool\","]
#[doc = "        \"system\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AppendSessionMessageCommand {
    pub command: AppendSessionMessageCommandCommand,
    pub content: MessagePartsWire,
    pub idempotency_key: ::std::string::String,
    pub input_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub role: AppendSessionMessageCommandRole,
    pub run_id: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`AppendSessionMessageCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"append-session-message\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AppendSessionMessageCommandCommand {
    #[serde(rename = "append-session-message")]
    AppendSessionMessage,
}
impl ::std::fmt::Display for AppendSessionMessageCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AppendSessionMessage => f.write_str("append-session-message"),
        }
    }
}
impl ::std::str::FromStr for AppendSessionMessageCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "append-session-message" => Ok(Self::AppendSessionMessage),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AppendSessionMessageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AppendSessionMessageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AppendSessionMessageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AppendSessionMessageCommandRole`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"user\","]
#[doc = "    \"assistant\","]
#[doc = "    \"tool\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AppendSessionMessageCommandRole {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "assistant")]
    Assistant,
    #[serde(rename = "tool")]
    Tool,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for AppendSessionMessageCommandRole {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::User => f.write_str("user"),
            Self::Assistant => f.write_str("assistant"),
            Self::Tool => f.write_str("tool"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for AppendSessionMessageCommandRole {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "user" => Ok(Self::User),
            "assistant" => Ok(Self::Assistant),
            "tool" => Ok(Self::Tool),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AppendSessionMessageCommandRole {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AppendSessionMessageCommandRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AppendSessionMessageCommandRole {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AppendTeamTurnCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"append-team-turn\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/AppendTeamTurnWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AppendTeamTurnCommand {
    pub command: AppendTeamTurnCommandCommand,
    pub request: AppendTeamTurnWire,
}
#[doc = "`AppendTeamTurnCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"append-team-turn\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AppendTeamTurnCommandCommand {
    #[serde(rename = "append-team-turn")]
    AppendTeamTurn,
}
impl ::std::fmt::Display for AppendTeamTurnCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AppendTeamTurn => f.write_str("append-team-turn"),
        }
    }
}
impl ::std::str::FromStr for AppendTeamTurnCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "append-team-turn" => Ok(Self::AppendTeamTurn),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AppendTeamTurnCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for AppendTeamTurnCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AppendTeamTurnCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AppendTeamTurnWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"audience_participant_ids\","]
#[doc = "    \"content\","]
#[doc = "    \"conversation_id\","]
#[doc = "    \"id\","]
#[doc = "    \"kind\","]
#[doc = "    \"metadata\","]
#[doc = "    \"speaker_participant_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"audience_participant_ids\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamAudienceParticipantIdsWire\""]
#[doc = "    },"]
#[doc = "    \"content\": {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamTurnKindWire\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"speaker_participant_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AppendTeamTurnWire {
    pub audience_participant_ids: NullableTeamAudienceParticipantIdsWire,
    pub content: MessagePartsWire,
    pub conversation_id: ::std::string::String,
    pub id: NullableString,
    pub kind: NullableTeamTurnKindWire,
    pub metadata: ::serde_json::Value,
    pub speaker_participant_id: ::std::string::String,
}
#[doc = "`ApplySessionRunControlCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"apply-session-run-control\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ApplySessionRunControlWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ApplySessionRunControlCommand {
    pub command: ApplySessionRunControlCommandCommand,
    pub request: ApplySessionRunControlWire,
}
#[doc = "`ApplySessionRunControlCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"apply-session-run-control\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ApplySessionRunControlCommandCommand {
    #[serde(rename = "apply-session-run-control")]
    ApplySessionRunControl,
}
impl ::std::fmt::Display for ApplySessionRunControlCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ApplySessionRunControl => f.write_str("apply-session-run-control"),
        }
    }
}
impl ::std::str::FromStr for ApplySessionRunControlCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "apply-session-run-control" => Ok(Self::ApplySessionRunControl),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ApplySessionRunControlCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ApplySessionRunControlCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ApplySessionRunControlCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ApplySessionRunControlWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"control_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"run_id\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"control_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ApplySessionRunControlWire {
    pub control_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub run_id: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`AttachDelegationGraphNodeJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"attach-delegation-graph-node-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/AttachDelegationGraphNodeJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AttachDelegationGraphNodeJobCommand {
    pub command: AttachDelegationGraphNodeJobCommandCommand,
    pub request: AttachDelegationGraphNodeJobWire,
}
#[doc = "`AttachDelegationGraphNodeJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"attach-delegation-graph-node-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum AttachDelegationGraphNodeJobCommandCommand {
    #[serde(rename = "attach-delegation-graph-node-job")]
    AttachDelegationGraphNodeJob,
}
impl ::std::fmt::Display for AttachDelegationGraphNodeJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AttachDelegationGraphNodeJob => f.write_str("attach-delegation-graph-node-job"),
        }
    }
}
impl ::std::str::FromStr for AttachDelegationGraphNodeJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "attach-delegation-graph-node-job" => Ok(Self::AttachDelegationGraphNodeJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for AttachDelegationGraphNodeJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for AttachDelegationGraphNodeJobCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for AttachDelegationGraphNodeJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`AttachDelegationGraphNodeJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"node_id\","]
#[doc = "    \"scheduler_job_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"node_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"scheduler_job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct AttachDelegationGraphNodeJobWire {
    pub node_id: ::std::string::String,
    pub scheduler_job_id: ::std::string::String,
}
#[doc = "`BeginToolExecutionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"begin-tool-execution\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/BeginToolExecutionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BeginToolExecutionCommand {
    pub command: BeginToolExecutionCommandCommand,
    pub request: BeginToolExecutionWire,
}
#[doc = "`BeginToolExecutionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"begin-tool-execution\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BeginToolExecutionCommandCommand {
    #[serde(rename = "begin-tool-execution")]
    BeginToolExecution,
}
impl ::std::fmt::Display for BeginToolExecutionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::BeginToolExecution => f.write_str("begin-tool-execution"),
        }
    }
}
impl ::std::str::FromStr for BeginToolExecutionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "begin-tool-execution" => Ok(Self::BeginToolExecution),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BeginToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BeginToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BeginToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`BeginToolExecutionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"descriptor\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"input\","]
#[doc = "    \"input_id\","]
#[doc = "    \"permission\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"tool_call_id\","]
#[doc = "    \"tool_name\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"descriptor\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"input\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"permission\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"tool_call_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"tool_name\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BeginToolExecutionWire {
    pub descriptor: ::serde_json::Value,
    pub idempotency_key: ::std::string::String,
    pub input: ::serde_json::Value,
    pub input_id: ::std::string::String,
    pub permission: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub run_id: ::std::string::String,
    pub session_id: ::std::string::String,
    pub tool_call_id: ::std::string::String,
    pub tool_name: ::std::string::String,
}
#[doc = "`BudgetAmountWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"cost_micros\","]
#[doc = "    \"tokens\","]
#[doc = "    \"tool_calls\","]
#[doc = "    \"wall_time_ms\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"cost_micros\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"tokens\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"tool_calls\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"wall_time_ms\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BudgetAmountWire {
    pub cost_micros: NullableInteger,
    pub tokens: NullableInteger,
    pub tool_calls: NullableInteger,
    pub wall_time_ms: NullableInteger,
}
#[doc = "`BudgetScopeKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"session\","]
#[doc = "    \"turn\","]
#[doc = "    \"team_round\","]
#[doc = "    \"plugin\","]
#[doc = "    \"principal\","]
#[doc = "    \"provider_model\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BudgetScopeKindWire {
    #[serde(rename = "session")]
    Session,
    #[serde(rename = "turn")]
    Turn,
    #[serde(rename = "team_round")]
    TeamRound,
    #[serde(rename = "plugin")]
    Plugin,
    #[serde(rename = "principal")]
    Principal,
    #[serde(rename = "provider_model")]
    ProviderModel,
}
impl ::std::fmt::Display for BudgetScopeKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Session => f.write_str("session"),
            Self::Turn => f.write_str("turn"),
            Self::TeamRound => f.write_str("team_round"),
            Self::Plugin => f.write_str("plugin"),
            Self::Principal => f.write_str("principal"),
            Self::ProviderModel => f.write_str("provider_model"),
        }
    }
}
impl ::std::str::FromStr for BudgetScopeKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "session" => Ok(Self::Session),
            "turn" => Ok(Self::Turn),
            "team_round" => Ok(Self::TeamRound),
            "plugin" => Ok(Self::Plugin),
            "principal" => Ok(Self::Principal),
            "provider_model" => Ok(Self::ProviderModel),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BudgetScopeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BudgetScopeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BudgetScopeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`BudgetScopeRefWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\","]
#[doc = "    \"owner_id\","]
#[doc = "    \"window_kind\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetScopeKindWire\""]
#[doc = "    },"]
#[doc = "    \"owner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"window_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableBudgetWindowKindWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct BudgetScopeRefWire {
    pub kind: BudgetScopeKindWire,
    pub owner_id: ::std::string::String,
    pub window_kind: NullableBudgetWindowKindWire,
}
#[doc = "`BudgetWindowKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"run\","]
#[doc = "    \"session\","]
#[doc = "    \"day\","]
#[doc = "    \"month\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum BudgetWindowKindWire {
    #[serde(rename = "run")]
    Run,
    #[serde(rename = "session")]
    Session,
    #[serde(rename = "day")]
    Day,
    #[serde(rename = "month")]
    Month,
}
impl ::std::fmt::Display for BudgetWindowKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Run => f.write_str("run"),
            Self::Session => f.write_str("session"),
            Self::Day => f.write_str("day"),
            Self::Month => f.write_str("month"),
        }
    }
}
impl ::std::str::FromStr for BudgetWindowKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "run" => Ok(Self::Run),
            "session" => Ok(Self::Session),
            "day" => Ok(Self::Day),
            "month" => Ok(Self::Month),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for BudgetWindowKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for BudgetWindowKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for BudgetWindowKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CancelJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"cancel-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CancelJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CancelJobCommand {
    pub command: CancelJobCommandCommand,
    pub request: CancelJobWire,
}
#[doc = "`CancelJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"cancel-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CancelJobCommandCommand {
    #[serde(rename = "cancel-job")]
    CancelJob,
}
impl ::std::fmt::Display for CancelJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CancelJob => f.write_str("cancel-job"),
        }
    }
}
impl ::std::str::FromStr for CancelJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "cancel-job" => Ok(Self::CancelJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CancelJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CancelJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CancelJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CancelJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"job_id\","]
#[doc = "    \"reason\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CancelJobWire {
    pub job_id: ::std::string::String,
    pub reason: ::std::string::String,
}
#[doc = "`CancelRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"input_id\","]
#[doc = "    \"reason\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"cancel-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CancelRunCommand {
    pub command: CancelRunCommandCommand,
    pub input_id: ::std::string::String,
    pub reason: ::std::string::String,
    pub run_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`CancelRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"cancel-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CancelRunCommandCommand {
    #[serde(rename = "cancel-run")]
    CancelRun,
}
impl ::std::fmt::Display for CancelRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CancelRun => f.write_str("cancel-run"),
        }
    }
}
impl ::std::str::FromStr for CancelRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "cancel-run" => Ok(Self::CancelRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CancelRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CancelRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CancelRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChannelBindingStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"active\","]
#[doc = "    \"revoked\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ChannelBindingStateWire {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "revoked")]
    Revoked,
}
impl ::std::fmt::Display for ChannelBindingStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Revoked => f.write_str("revoked"),
        }
    }
}
impl ::std::str::FromStr for ChannelBindingStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "revoked" => Ok(Self::Revoked),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChannelBindingStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ChannelBindingStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChannelBindingStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChannelInboundEventStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"received\","]
#[doc = "    \"projected\","]
#[doc = "    \"ignored\","]
#[doc = "    \"failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ChannelInboundEventStateWire {
    #[serde(rename = "received")]
    Received,
    #[serde(rename = "projected")]
    Projected,
    #[serde(rename = "ignored")]
    Ignored,
    #[serde(rename = "failed")]
    Failed,
}
impl ::std::fmt::Display for ChannelInboundEventStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Received => f.write_str("received"),
            Self::Projected => f.write_str("projected"),
            Self::Ignored => f.write_str("ignored"),
            Self::Failed => f.write_str("failed"),
        }
    }
}
impl ::std::str::FromStr for ChannelInboundEventStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "received" => Ok(Self::Received),
            "projected" => Ok(Self::Projected),
            "ignored" => Ok(Self::Ignored),
            "failed" => Ok(Self::Failed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChannelInboundEventStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ChannelInboundEventStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChannelInboundEventStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChannelProjectionTargetKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"session.run\","]
#[doc = "    \"team.turn\","]
#[doc = "    \"workspace.task\","]
#[doc = "    \"ignored\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ChannelProjectionTargetKindWire {
    #[serde(rename = "session.run")]
    SessionRun,
    #[serde(rename = "team.turn")]
    TeamTurn,
    #[serde(rename = "workspace.task")]
    WorkspaceTask,
    #[serde(rename = "ignored")]
    Ignored,
}
impl ::std::fmt::Display for ChannelProjectionTargetKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SessionRun => f.write_str("session.run"),
            Self::TeamTurn => f.write_str("team.turn"),
            Self::WorkspaceTask => f.write_str("workspace.task"),
            Self::Ignored => f.write_str("ignored"),
        }
    }
}
impl ::std::str::FromStr for ChannelProjectionTargetKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "session.run" => Ok(Self::SessionRun),
            "team.turn" => Ok(Self::TeamTurn),
            "workspace.task" => Ok(Self::WorkspaceTask),
            "ignored" => Ok(Self::Ignored),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ChannelProjectionTargetKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ChannelProjectionTargetKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ChannelProjectionTargetKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ChannelStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutChannelBindingCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelBindingsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RevokeChannelBindingCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/IngestChannelInboundEventCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelInboundEventsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateChannelInboundEventStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitChannelDeliveryCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CompleteChannelDeliveryCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/FailChannelDeliveryCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ProjectChannelInboundEventCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelProjectionsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum ChannelStorageRpcCommand {
    PutChannelBindingCommand(PutChannelBindingCommand),
    ListChannelBindingsCommand(ListChannelBindingsCommand),
    RevokeChannelBindingCommand(RevokeChannelBindingCommand),
    IngestChannelInboundEventCommand(IngestChannelInboundEventCommand),
    ListChannelInboundEventsCommand(ListChannelInboundEventsCommand),
    UpdateChannelInboundEventStateCommand(UpdateChannelInboundEventStateCommand),
    SubmitChannelDeliveryCommand(SubmitChannelDeliveryCommand),
    CompleteChannelDeliveryCommand(CompleteChannelDeliveryCommand),
    FailChannelDeliveryCommand(FailChannelDeliveryCommand),
    ProjectChannelInboundEventCommand(ProjectChannelInboundEventCommand),
    ListChannelProjectionsCommand(ListChannelProjectionsCommand),
}
impl ::std::convert::From<PutChannelBindingCommand> for ChannelStorageRpcCommand {
    fn from(value: PutChannelBindingCommand) -> Self {
        Self::PutChannelBindingCommand(value)
    }
}
impl ::std::convert::From<ListChannelBindingsCommand> for ChannelStorageRpcCommand {
    fn from(value: ListChannelBindingsCommand) -> Self {
        Self::ListChannelBindingsCommand(value)
    }
}
impl ::std::convert::From<RevokeChannelBindingCommand> for ChannelStorageRpcCommand {
    fn from(value: RevokeChannelBindingCommand) -> Self {
        Self::RevokeChannelBindingCommand(value)
    }
}
impl ::std::convert::From<IngestChannelInboundEventCommand> for ChannelStorageRpcCommand {
    fn from(value: IngestChannelInboundEventCommand) -> Self {
        Self::IngestChannelInboundEventCommand(value)
    }
}
impl ::std::convert::From<ListChannelInboundEventsCommand> for ChannelStorageRpcCommand {
    fn from(value: ListChannelInboundEventsCommand) -> Self {
        Self::ListChannelInboundEventsCommand(value)
    }
}
impl ::std::convert::From<UpdateChannelInboundEventStateCommand> for ChannelStorageRpcCommand {
    fn from(value: UpdateChannelInboundEventStateCommand) -> Self {
        Self::UpdateChannelInboundEventStateCommand(value)
    }
}
impl ::std::convert::From<SubmitChannelDeliveryCommand> for ChannelStorageRpcCommand {
    fn from(value: SubmitChannelDeliveryCommand) -> Self {
        Self::SubmitChannelDeliveryCommand(value)
    }
}
impl ::std::convert::From<CompleteChannelDeliveryCommand> for ChannelStorageRpcCommand {
    fn from(value: CompleteChannelDeliveryCommand) -> Self {
        Self::CompleteChannelDeliveryCommand(value)
    }
}
impl ::std::convert::From<FailChannelDeliveryCommand> for ChannelStorageRpcCommand {
    fn from(value: FailChannelDeliveryCommand) -> Self {
        Self::FailChannelDeliveryCommand(value)
    }
}
impl ::std::convert::From<ProjectChannelInboundEventCommand> for ChannelStorageRpcCommand {
    fn from(value: ProjectChannelInboundEventCommand) -> Self {
        Self::ProjectChannelInboundEventCommand(value)
    }
}
impl ::std::convert::From<ListChannelProjectionsCommand> for ChannelStorageRpcCommand {
    fn from(value: ListChannelProjectionsCommand) -> Self {
        Self::ListChannelProjectionsCommand(value)
    }
}
#[doc = "`ClaimJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"claim-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ClaimJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ClaimJobCommand {
    pub command: ClaimJobCommandCommand,
    pub request: ClaimJobWire,
}
#[doc = "`ClaimJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"claim-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ClaimJobCommandCommand {
    #[serde(rename = "claim-job")]
    ClaimJob,
}
impl ::std::fmt::Display for ClaimJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ClaimJob => f.write_str("claim-job"),
        }
    }
}
impl ::std::str::FromStr for ClaimJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "claim-job" => Ok(Self::ClaimJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ClaimJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ClaimJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ClaimJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ClaimJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kinds\","]
#[doc = "    \"lease_ms\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kinds\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSchedulerJobKindsWire\""]
#[doc = "    },"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ClaimJobWire {
    pub kinds: NullableSchedulerJobKindsWire,
    pub lease_ms: i64,
    pub worker_id: ::std::string::String,
}
#[doc = "`ClaimRunnerCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"lease_ms\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"claim-runner\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ClaimRunnerCommand {
    pub command: ClaimRunnerCommandCommand,
    pub lease_ms: i64,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`ClaimRunnerCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"claim-runner\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ClaimRunnerCommandCommand {
    #[serde(rename = "claim-runner")]
    ClaimRunner,
}
impl ::std::fmt::Display for ClaimRunnerCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ClaimRunner => f.write_str("claim-runner"),
        }
    }
}
impl ::std::str::FromStr for ClaimRunnerCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "claim-runner" => Ok(Self::ClaimRunner),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ClaimRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ClaimRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ClaimRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CleanupExpiredResourceTicketsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"cleanup-expired-resource-tickets\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CleanupExpiredResourceTicketsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CleanupExpiredResourceTicketsCommand {
    pub command: CleanupExpiredResourceTicketsCommandCommand,
    pub request: CleanupExpiredResourceTicketsWire,
}
#[doc = "`CleanupExpiredResourceTicketsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"cleanup-expired-resource-tickets\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CleanupExpiredResourceTicketsCommandCommand {
    #[serde(rename = "cleanup-expired-resource-tickets")]
    CleanupExpiredResourceTickets,
}
impl ::std::fmt::Display for CleanupExpiredResourceTicketsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CleanupExpiredResourceTickets => f.write_str("cleanup-expired-resource-tickets"),
        }
    }
}
impl ::std::str::FromStr for CleanupExpiredResourceTicketsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "cleanup-expired-resource-tickets" => Ok(Self::CleanupExpiredResourceTickets),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CleanupExpiredResourceTicketsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for CleanupExpiredResourceTicketsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for CleanupExpiredResourceTicketsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CleanupExpiredResourceTicketsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"now_ms\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableUnsigned32\""]
#[doc = "    },"]
#[doc = "    \"now_ms\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CleanupExpiredResourceTicketsWire {
    pub limit: NullableUnsigned32,
    pub now_ms: NullableInteger,
}
#[doc = "`CloneContextEpochCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"clone-context-epoch\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CloneContextEpochWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CloneContextEpochCommand {
    pub command: CloneContextEpochCommandCommand,
    pub request: CloneContextEpochWire,
}
#[doc = "`CloneContextEpochCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"clone-context-epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CloneContextEpochCommandCommand {
    #[serde(rename = "clone-context-epoch")]
    CloneContextEpoch,
}
impl ::std::fmt::Display for CloneContextEpochCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CloneContextEpoch => f.write_str("clone-context-epoch"),
        }
    }
}
impl ::std::str::FromStr for CloneContextEpochCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "clone-context-epoch" => Ok(Self::CloneContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CloneContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CloneContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CloneContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CloneContextEpochWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"source_epoch_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"source_epoch_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CloneContextEpochWire {
    pub id: NullableString,
    pub metadata: ::serde_json::Value,
    pub source_epoch_id: ::std::string::String,
}
#[doc = "`CommitBudgetCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"commit-budget\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CommitBudgetWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CommitBudgetCommand {
    pub command: CommitBudgetCommandCommand,
    pub request: CommitBudgetWire,
}
#[doc = "`CommitBudgetCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"commit-budget\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CommitBudgetCommandCommand {
    #[serde(rename = "commit-budget")]
    CommitBudget,
}
impl ::std::fmt::Display for CommitBudgetCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CommitBudget => f.write_str("commit-budget"),
        }
    }
}
impl ::std::str::FromStr for CommitBudgetCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "commit-budget" => Ok(Self::CommitBudget),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CommitBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CommitBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CommitBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CommitBudgetWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"grant_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"grant_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CommitBudgetWire {
    pub grant_id: ::std::string::String,
}
#[doc = "`CompleteChannelDeliveryCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"complete-channel-delivery\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CompleteChannelDeliveryWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CompleteChannelDeliveryCommand {
    pub command: CompleteChannelDeliveryCommandCommand,
    pub request: CompleteChannelDeliveryWire,
}
#[doc = "`CompleteChannelDeliveryCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"complete-channel-delivery\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CompleteChannelDeliveryCommandCommand {
    #[serde(rename = "complete-channel-delivery")]
    CompleteChannelDelivery,
}
impl ::std::fmt::Display for CompleteChannelDeliveryCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CompleteChannelDelivery => f.write_str("complete-channel-delivery"),
        }
    }
}
impl ::std::str::FromStr for CompleteChannelDeliveryCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "complete-channel-delivery" => Ok(Self::CompleteChannelDelivery),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CompleteChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CompleteChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CompleteChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CompleteChannelDeliveryWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"delivery_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"metadata\","]
#[doc = "    \"result\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"delivery_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CompleteChannelDeliveryWire {
    pub delivery_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub result: ::serde_json::Value,
    pub worker_id: ::std::string::String,
}
#[doc = "`CompleteJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"complete-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/CompleteJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CompleteJobCommand {
    pub command: CompleteJobCommandCommand,
    pub request: CompleteJobWire,
}
#[doc = "`CompleteJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"complete-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CompleteJobCommandCommand {
    #[serde(rename = "complete-job")]
    CompleteJob,
}
impl ::std::fmt::Display for CompleteJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CompleteJob => f.write_str("complete-job"),
        }
    }
}
impl ::std::str::FromStr for CompleteJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "complete-job" => Ok(Self::CompleteJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CompleteJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CompleteJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CompleteJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CompleteJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"job_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"result\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CompleteJobWire {
    pub job_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub result: ::serde_json::Value,
    pub worker_id: ::std::string::String,
}
#[doc = "`CompleteRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"assistant_message\","]
#[doc = "    \"command\","]
#[doc = "    \"input_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"run_id\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"assistant_message\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableMessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"complete-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CompleteRunCommand {
    pub assistant_message: NullableMessagePartsWire,
    pub command: CompleteRunCommandCommand,
    pub input_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub run_id: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`CompleteRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"complete-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CompleteRunCommandCommand {
    #[serde(rename = "complete-run")]
    CompleteRun,
}
impl ::std::fmt::Display for CompleteRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CompleteRun => f.write_str("complete-run"),
        }
    }
}
impl ::std::str::FromStr for CompleteRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "complete-run" => Ok(Self::CompleteRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CompleteRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CompleteRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CompleteRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorCredentialStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"active\","]
#[doc = "    \"revoked\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ConnectorCredentialStateWire {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "revoked")]
    Revoked,
}
impl ::std::fmt::Display for ConnectorCredentialStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Revoked => f.write_str("revoked"),
        }
    }
}
impl ::std::str::FromStr for ConnectorCredentialStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "revoked" => Ok(Self::Revoked),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConnectorCredentialStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ConnectorCredentialStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConnectorCredentialStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorFinishedSessionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"disconnected\","]
#[doc = "    \"failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ConnectorFinishedSessionStateWire {
    #[serde(rename = "disconnected")]
    Disconnected,
    #[serde(rename = "failed")]
    Failed,
}
impl ::std::fmt::Display for ConnectorFinishedSessionStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Disconnected => f.write_str("disconnected"),
            Self::Failed => f.write_str("failed"),
        }
    }
}
impl ::std::str::FromStr for ConnectorFinishedSessionStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "disconnected" => Ok(Self::Disconnected),
            "failed" => Ok(Self::Failed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConnectorFinishedSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ConnectorFinishedSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConnectorFinishedSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorLiveSessionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"connecting\","]
#[doc = "    \"connected\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ConnectorLiveSessionStateWire {
    #[serde(rename = "connecting")]
    Connecting,
    #[serde(rename = "connected")]
    Connected,
}
impl ::std::fmt::Display for ConnectorLiveSessionStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Connecting => f.write_str("connecting"),
            Self::Connected => f.write_str("connected"),
        }
    }
}
impl ::std::str::FromStr for ConnectorLiveSessionStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "connecting" => Ok(Self::Connecting),
            "connected" => Ok(Self::Connected),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConnectorLiveSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ConnectorLiveSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConnectorLiveSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorRegistrationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"active\","]
#[doc = "    \"disabled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ConnectorRegistrationStateWire {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "disabled")]
    Disabled,
}
impl ::std::fmt::Display for ConnectorRegistrationStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Disabled => f.write_str("disabled"),
        }
    }
}
impl ::std::str::FromStr for ConnectorRegistrationStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "disabled" => Ok(Self::Disabled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConnectorRegistrationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ConnectorRegistrationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConnectorRegistrationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorSessionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"connecting\","]
#[doc = "    \"connected\","]
#[doc = "    \"disconnected\","]
#[doc = "    \"expired\","]
#[doc = "    \"failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ConnectorSessionStateWire {
    #[serde(rename = "connecting")]
    Connecting,
    #[serde(rename = "connected")]
    Connected,
    #[serde(rename = "disconnected")]
    Disconnected,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "failed")]
    Failed,
}
impl ::std::fmt::Display for ConnectorSessionStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Connecting => f.write_str("connecting"),
            Self::Connected => f.write_str("connected"),
            Self::Disconnected => f.write_str("disconnected"),
            Self::Expired => f.write_str("expired"),
            Self::Failed => f.write_str("failed"),
        }
    }
}
impl ::std::str::FromStr for ConnectorSessionStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "connecting" => Ok(Self::Connecting),
            "connected" => Ok(Self::Connected),
            "disconnected" => Ok(Self::Disconnected),
            "expired" => Ok(Self::Expired),
            "failed" => Ok(Self::Failed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ConnectorSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ConnectorSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ConnectorSessionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ConnectorStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutConnectorRegistrationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorRegistrationsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateConnectorRegistrationStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutConnectorCredentialCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorCredentialsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RevokeConnectorCredentialCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StartConnectorSessionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/HeartbeatConnectorSessionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/FinishConnectorSessionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorSessionsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum ConnectorStorageRpcCommand {
    PutConnectorRegistrationCommand(PutConnectorRegistrationCommand),
    ListConnectorRegistrationsCommand(ListConnectorRegistrationsCommand),
    UpdateConnectorRegistrationStateCommand(UpdateConnectorRegistrationStateCommand),
    PutConnectorCredentialCommand(PutConnectorCredentialCommand),
    ListConnectorCredentialsCommand(ListConnectorCredentialsCommand),
    RevokeConnectorCredentialCommand(RevokeConnectorCredentialCommand),
    StartConnectorSessionCommand(StartConnectorSessionCommand),
    HeartbeatConnectorSessionCommand(HeartbeatConnectorSessionCommand),
    FinishConnectorSessionCommand(FinishConnectorSessionCommand),
    ListConnectorSessionsCommand(ListConnectorSessionsCommand),
}
impl ::std::convert::From<PutConnectorRegistrationCommand> for ConnectorStorageRpcCommand {
    fn from(value: PutConnectorRegistrationCommand) -> Self {
        Self::PutConnectorRegistrationCommand(value)
    }
}
impl ::std::convert::From<ListConnectorRegistrationsCommand> for ConnectorStorageRpcCommand {
    fn from(value: ListConnectorRegistrationsCommand) -> Self {
        Self::ListConnectorRegistrationsCommand(value)
    }
}
impl ::std::convert::From<UpdateConnectorRegistrationStateCommand> for ConnectorStorageRpcCommand {
    fn from(value: UpdateConnectorRegistrationStateCommand) -> Self {
        Self::UpdateConnectorRegistrationStateCommand(value)
    }
}
impl ::std::convert::From<PutConnectorCredentialCommand> for ConnectorStorageRpcCommand {
    fn from(value: PutConnectorCredentialCommand) -> Self {
        Self::PutConnectorCredentialCommand(value)
    }
}
impl ::std::convert::From<ListConnectorCredentialsCommand> for ConnectorStorageRpcCommand {
    fn from(value: ListConnectorCredentialsCommand) -> Self {
        Self::ListConnectorCredentialsCommand(value)
    }
}
impl ::std::convert::From<RevokeConnectorCredentialCommand> for ConnectorStorageRpcCommand {
    fn from(value: RevokeConnectorCredentialCommand) -> Self {
        Self::RevokeConnectorCredentialCommand(value)
    }
}
impl ::std::convert::From<StartConnectorSessionCommand> for ConnectorStorageRpcCommand {
    fn from(value: StartConnectorSessionCommand) -> Self {
        Self::StartConnectorSessionCommand(value)
    }
}
impl ::std::convert::From<HeartbeatConnectorSessionCommand> for ConnectorStorageRpcCommand {
    fn from(value: HeartbeatConnectorSessionCommand) -> Self {
        Self::HeartbeatConnectorSessionCommand(value)
    }
}
impl ::std::convert::From<FinishConnectorSessionCommand> for ConnectorStorageRpcCommand {
    fn from(value: FinishConnectorSessionCommand) -> Self {
        Self::FinishConnectorSessionCommand(value)
    }
}
impl ::std::convert::From<ListConnectorSessionsCommand> for ConnectorStorageRpcCommand {
    fn from(value: ListConnectorSessionsCommand) -> Self {
        Self::ListConnectorSessionsCommand(value)
    }
}
#[doc = "`ContextEpochStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"building\","]
#[doc = "    \"active\","]
#[doc = "    \"superseded\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ContextEpochStateWire {
    #[serde(rename = "building")]
    Building,
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "superseded")]
    Superseded,
}
impl ::std::fmt::Display for ContextEpochStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Building => f.write_str("building"),
            Self::Active => f.write_str("active"),
            Self::Superseded => f.write_str("superseded"),
        }
    }
}
impl ::std::str::FromStr for ContextEpochStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "building" => Ok(Self::Building),
            "active" => Ok(Self::Active),
            "superseded" => Ok(Self::Superseded),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ContextEpochStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ContextEpochStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ContextEpochStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ContextReplacementTierWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"tier1_snip\","]
#[doc = "    \"tier2_placeholder\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ContextReplacementTierWire {
    #[serde(rename = "tier1_snip")]
    Tier1Snip,
    #[serde(rename = "tier2_placeholder")]
    Tier2Placeholder,
}
impl ::std::fmt::Display for ContextReplacementTierWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Tier1Snip => f.write_str("tier1_snip"),
            Self::Tier2Placeholder => f.write_str("tier2_placeholder"),
        }
    }
}
impl ::std::str::FromStr for ContextReplacementTierWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "tier1_snip" => Ok(Self::Tier1Snip),
            "tier2_placeholder" => Ok(Self::Tier2Placeholder),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ContextReplacementTierWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ContextReplacementTierWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ContextReplacementTierWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ContextStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutContextEpochCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ActivateContextEpochCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CloneContextEpochCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PruneContextEpochsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListContextEpochsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetActiveContextEpochCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutContextReplacementCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListContextReplacementsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum ContextStorageRpcCommand {
    PutContextEpochCommand(PutContextEpochCommand),
    ActivateContextEpochCommand(ActivateContextEpochCommand),
    CloneContextEpochCommand(CloneContextEpochCommand),
    PruneContextEpochsCommand(PruneContextEpochsCommand),
    ListContextEpochsCommand(ListContextEpochsCommand),
    GetActiveContextEpochCommand(GetActiveContextEpochCommand),
    PutContextReplacementCommand(PutContextReplacementCommand),
    ListContextReplacementsCommand(ListContextReplacementsCommand),
}
impl ::std::convert::From<PutContextEpochCommand> for ContextStorageRpcCommand {
    fn from(value: PutContextEpochCommand) -> Self {
        Self::PutContextEpochCommand(value)
    }
}
impl ::std::convert::From<ActivateContextEpochCommand> for ContextStorageRpcCommand {
    fn from(value: ActivateContextEpochCommand) -> Self {
        Self::ActivateContextEpochCommand(value)
    }
}
impl ::std::convert::From<CloneContextEpochCommand> for ContextStorageRpcCommand {
    fn from(value: CloneContextEpochCommand) -> Self {
        Self::CloneContextEpochCommand(value)
    }
}
impl ::std::convert::From<PruneContextEpochsCommand> for ContextStorageRpcCommand {
    fn from(value: PruneContextEpochsCommand) -> Self {
        Self::PruneContextEpochsCommand(value)
    }
}
impl ::std::convert::From<ListContextEpochsCommand> for ContextStorageRpcCommand {
    fn from(value: ListContextEpochsCommand) -> Self {
        Self::ListContextEpochsCommand(value)
    }
}
impl ::std::convert::From<GetActiveContextEpochCommand> for ContextStorageRpcCommand {
    fn from(value: GetActiveContextEpochCommand) -> Self {
        Self::GetActiveContextEpochCommand(value)
    }
}
impl ::std::convert::From<PutContextReplacementCommand> for ContextStorageRpcCommand {
    fn from(value: PutContextReplacementCommand) -> Self {
        Self::PutContextReplacementCommand(value)
    }
}
impl ::std::convert::From<ListContextReplacementsCommand> for ContextStorageRpcCommand {
    fn from(value: ListContextReplacementsCommand) -> Self {
        Self::ListContextReplacementsCommand(value)
    }
}
#[doc = "`CreateResourceTicketCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"capability\","]
#[doc = "    \"command\","]
#[doc = "    \"expires_at\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"resource_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"capability\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"read\","]
#[doc = "        \"write\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"create-resource-ticket\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"expires_at\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"resource_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CreateResourceTicketCommand {
    pub capability: CreateResourceTicketCommandCapability,
    pub command: CreateResourceTicketCommandCommand,
    pub expires_at: i64,
    pub principal_id: ::std::string::String,
    pub resource_id: ::std::string::String,
}
#[doc = "`CreateResourceTicketCommandCapability`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"read\","]
#[doc = "    \"write\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CreateResourceTicketCommandCapability {
    #[serde(rename = "read")]
    Read,
    #[serde(rename = "write")]
    Write,
}
impl ::std::fmt::Display for CreateResourceTicketCommandCapability {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Read => f.write_str("read"),
            Self::Write => f.write_str("write"),
        }
    }
}
impl ::std::str::FromStr for CreateResourceTicketCommandCapability {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "read" => Ok(Self::Read),
            "write" => Ok(Self::Write),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CreateResourceTicketCommandCapability {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CreateResourceTicketCommandCapability {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CreateResourceTicketCommandCapability {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CreateResourceTicketCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"create-resource-ticket\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CreateResourceTicketCommandCommand {
    #[serde(rename = "create-resource-ticket")]
    CreateResourceTicket,
}
impl ::std::fmt::Display for CreateResourceTicketCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CreateResourceTicket => f.write_str("create-resource-ticket"),
        }
    }
}
impl ::std::str::FromStr for CreateResourceTicketCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "create-resource-ticket" => Ok(Self::CreateResourceTicket),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CreateResourceTicketCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CreateResourceTicketCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CreateResourceTicketCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`CreateSessionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"id\","]
#[doc = "    \"kind\","]
#[doc = "    \"title\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"create-session\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionKindWire\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct CreateSessionCommand {
    pub command: CreateSessionCommandCommand,
    pub id: NullableString,
    pub kind: NullableSessionKindWire,
    pub title: NullableString,
}
#[doc = "`CreateSessionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"create-session\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum CreateSessionCommandCommand {
    #[serde(rename = "create-session")]
    CreateSession,
}
impl ::std::fmt::Display for CreateSessionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::CreateSession => f.write_str("create-session"),
        }
    }
}
impl ::std::str::FromStr for CreateSessionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "create-session" => Ok(Self::CreateSession),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for CreateSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for CreateSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for CreateSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`DelegationDependencyKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"after_success\","]
#[doc = "    \"after_terminal\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum DelegationDependencyKindWire {
    #[serde(rename = "after_success")]
    AfterSuccess,
    #[serde(rename = "after_terminal")]
    AfterTerminal,
}
impl ::std::fmt::Display for DelegationDependencyKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AfterSuccess => f.write_str("after_success"),
            Self::AfterTerminal => f.write_str("after_terminal"),
        }
    }
}
impl ::std::str::FromStr for DelegationDependencyKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "after_success" => Ok(Self::AfterSuccess),
            "after_terminal" => Ok(Self::AfterTerminal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DelegationDependencyKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DelegationDependencyKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DelegationDependencyKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`DelegationGraphStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"open\","]
#[doc = "    \"running\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum DelegationGraphStateWire {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for DelegationGraphStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Open => f.write_str("open"),
            Self::Running => f.write_str("running"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for DelegationGraphStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "open" => Ok(Self::Open),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DelegationGraphStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DelegationGraphStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DelegationGraphStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`DelegationNodeKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"agent_task\","]
#[doc = "    \"workspace_task\","]
#[doc = "    \"tool_task\","]
#[doc = "    \"aggregation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum DelegationNodeKindWire {
    #[serde(rename = "agent_task")]
    AgentTask,
    #[serde(rename = "workspace_task")]
    WorkspaceTask,
    #[serde(rename = "tool_task")]
    ToolTask,
    #[serde(rename = "aggregation")]
    Aggregation,
}
impl ::std::fmt::Display for DelegationNodeKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::AgentTask => f.write_str("agent_task"),
            Self::WorkspaceTask => f.write_str("workspace_task"),
            Self::ToolTask => f.write_str("tool_task"),
            Self::Aggregation => f.write_str("aggregation"),
        }
    }
}
impl ::std::str::FromStr for DelegationNodeKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "agent_task" => Ok(Self::AgentTask),
            "workspace_task" => Ok(Self::WorkspaceTask),
            "tool_task" => Ok(Self::ToolTask),
            "aggregation" => Ok(Self::Aggregation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DelegationNodeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DelegationNodeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DelegationNodeKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`DelegationNodeStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"pending\","]
#[doc = "    \"ready\","]
#[doc = "    \"running\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\","]
#[doc = "    \"skipped\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum DelegationNodeStateWire {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "skipped")]
    Skipped,
}
impl ::std::fmt::Display for DelegationNodeStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Ready => f.write_str("ready"),
            Self::Running => f.write_str("running"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
            Self::Skipped => f.write_str("skipped"),
        }
    }
}
impl ::std::str::FromStr for DelegationNodeStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "ready" => Ok(Self::Ready),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "skipped" => Ok(Self::Skipped),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DelegationNodeStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DelegationNodeStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DelegationNodeStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`DelegationStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetDelegationGraphCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphNodeCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetDelegationGraphNodeCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphNodesCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphDependencyCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphDependenciesCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateDelegationGraphStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateDelegationGraphNodeStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/AttachDelegationGraphNodeJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListReadyDelegationGraphNodesCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/MaterializeReadyDelegationGraphNodeCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum DelegationStorageRpcCommand {
    PutDelegationGraphCommand(PutDelegationGraphCommand),
    GetDelegationGraphCommand(GetDelegationGraphCommand),
    ListDelegationGraphsCommand(ListDelegationGraphsCommand),
    PutDelegationGraphNodeCommand(PutDelegationGraphNodeCommand),
    GetDelegationGraphNodeCommand(GetDelegationGraphNodeCommand),
    ListDelegationGraphNodesCommand(ListDelegationGraphNodesCommand),
    PutDelegationGraphDependencyCommand(PutDelegationGraphDependencyCommand),
    ListDelegationGraphDependenciesCommand(ListDelegationGraphDependenciesCommand),
    UpdateDelegationGraphStateCommand(UpdateDelegationGraphStateCommand),
    UpdateDelegationGraphNodeStateCommand(UpdateDelegationGraphNodeStateCommand),
    AttachDelegationGraphNodeJobCommand(AttachDelegationGraphNodeJobCommand),
    ListReadyDelegationGraphNodesCommand(ListReadyDelegationGraphNodesCommand),
    MaterializeReadyDelegationGraphNodeCommand(MaterializeReadyDelegationGraphNodeCommand),
}
impl ::std::convert::From<PutDelegationGraphCommand> for DelegationStorageRpcCommand {
    fn from(value: PutDelegationGraphCommand) -> Self {
        Self::PutDelegationGraphCommand(value)
    }
}
impl ::std::convert::From<GetDelegationGraphCommand> for DelegationStorageRpcCommand {
    fn from(value: GetDelegationGraphCommand) -> Self {
        Self::GetDelegationGraphCommand(value)
    }
}
impl ::std::convert::From<ListDelegationGraphsCommand> for DelegationStorageRpcCommand {
    fn from(value: ListDelegationGraphsCommand) -> Self {
        Self::ListDelegationGraphsCommand(value)
    }
}
impl ::std::convert::From<PutDelegationGraphNodeCommand> for DelegationStorageRpcCommand {
    fn from(value: PutDelegationGraphNodeCommand) -> Self {
        Self::PutDelegationGraphNodeCommand(value)
    }
}
impl ::std::convert::From<GetDelegationGraphNodeCommand> for DelegationStorageRpcCommand {
    fn from(value: GetDelegationGraphNodeCommand) -> Self {
        Self::GetDelegationGraphNodeCommand(value)
    }
}
impl ::std::convert::From<ListDelegationGraphNodesCommand> for DelegationStorageRpcCommand {
    fn from(value: ListDelegationGraphNodesCommand) -> Self {
        Self::ListDelegationGraphNodesCommand(value)
    }
}
impl ::std::convert::From<PutDelegationGraphDependencyCommand> for DelegationStorageRpcCommand {
    fn from(value: PutDelegationGraphDependencyCommand) -> Self {
        Self::PutDelegationGraphDependencyCommand(value)
    }
}
impl ::std::convert::From<ListDelegationGraphDependenciesCommand> for DelegationStorageRpcCommand {
    fn from(value: ListDelegationGraphDependenciesCommand) -> Self {
        Self::ListDelegationGraphDependenciesCommand(value)
    }
}
impl ::std::convert::From<UpdateDelegationGraphStateCommand> for DelegationStorageRpcCommand {
    fn from(value: UpdateDelegationGraphStateCommand) -> Self {
        Self::UpdateDelegationGraphStateCommand(value)
    }
}
impl ::std::convert::From<UpdateDelegationGraphNodeStateCommand> for DelegationStorageRpcCommand {
    fn from(value: UpdateDelegationGraphNodeStateCommand) -> Self {
        Self::UpdateDelegationGraphNodeStateCommand(value)
    }
}
impl ::std::convert::From<AttachDelegationGraphNodeJobCommand> for DelegationStorageRpcCommand {
    fn from(value: AttachDelegationGraphNodeJobCommand) -> Self {
        Self::AttachDelegationGraphNodeJobCommand(value)
    }
}
impl ::std::convert::From<ListReadyDelegationGraphNodesCommand> for DelegationStorageRpcCommand {
    fn from(value: ListReadyDelegationGraphNodesCommand) -> Self {
        Self::ListReadyDelegationGraphNodesCommand(value)
    }
}
impl ::std::convert::From<MaterializeReadyDelegationGraphNodeCommand>
    for DelegationStorageRpcCommand
{
    fn from(value: MaterializeReadyDelegationGraphNodeCommand) -> Self {
        Self::MaterializeReadyDelegationGraphNodeCommand(value)
    }
}
#[doc = "`DoctorCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"doctor\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct DoctorCommand {
    pub command: DoctorCommandCommand,
}
#[doc = "`DoctorCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"doctor\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum DoctorCommandCommand {
    #[serde(rename = "doctor")]
    Doctor,
}
impl ::std::fmt::Display for DoctorCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Doctor => f.write_str("doctor"),
        }
    }
}
impl ::std::str::FromStr for DoctorCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "doctor" => Ok(Self::Doctor),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for DoctorCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for DoctorCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for DoctorCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`EnqueueJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"enqueue-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/EnqueueJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct EnqueueJobCommand {
    pub command: EnqueueJobCommandCommand,
    pub request: EnqueueJobWire,
}
#[doc = "`EnqueueJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"enqueue-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum EnqueueJobCommandCommand {
    #[serde(rename = "enqueue-job")]
    EnqueueJob,
}
impl ::std::fmt::Display for EnqueueJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::EnqueueJob => f.write_str("enqueue-job"),
        }
    }
}
impl ::std::str::FromStr for EnqueueJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "enqueue-job" => Ok(Self::EnqueueJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for EnqueueJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for EnqueueJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for EnqueueJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`EnqueueJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"budget_grant_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"kind\","]
#[doc = "    \"max_attempts\","]
#[doc = "    \"not_before\","]
#[doc = "    \"payload\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"priority\","]
#[doc = "    \"retry_policy\","]
#[doc = "    \"scheduled_at\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"budget_grant_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerJobKindWire\""]
#[doc = "    },"]
#[doc = "    \"max_attempts\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"not_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"priority\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"retry_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"scheduled_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct EnqueueJobWire {
    pub budget_grant_id: NullableString,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub kind: SchedulerJobKindWire,
    pub max_attempts: NullableInteger,
    pub not_before: NullableInteger,
    pub payload: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub priority: NullableInteger,
    pub retry_policy: NullableRetryPolicyWire,
    pub scheduled_at: NullableInteger,
}
#[doc = "`FailChannelDeliveryCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"fail-channel-delivery\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/FailChannelDeliveryWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FailChannelDeliveryCommand {
    pub command: FailChannelDeliveryCommandCommand,
    pub request: FailChannelDeliveryWire,
}
#[doc = "`FailChannelDeliveryCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"fail-channel-delivery\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FailChannelDeliveryCommandCommand {
    #[serde(rename = "fail-channel-delivery")]
    FailChannelDelivery,
}
impl ::std::fmt::Display for FailChannelDeliveryCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::FailChannelDelivery => f.write_str("fail-channel-delivery"),
        }
    }
}
impl ::std::str::FromStr for FailChannelDeliveryCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "fail-channel-delivery" => Ok(Self::FailChannelDelivery),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FailChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FailChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FailChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FailChannelDeliveryWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"delivery_id\","]
#[doc = "    \"error\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"metadata\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"delivery_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FailChannelDeliveryWire {
    pub delivery_id: ::std::string::String,
    pub error: ::serde_json::Value,
    pub lease_token: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub worker_id: ::std::string::String,
}
#[doc = "`FailJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"fail-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/FailJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FailJobCommand {
    pub command: FailJobCommandCommand,
    pub request: FailJobWire,
}
#[doc = "`FailJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"fail-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FailJobCommandCommand {
    #[serde(rename = "fail-job")]
    FailJob,
}
impl ::std::fmt::Display for FailJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::FailJob => f.write_str("fail-job"),
        }
    }
}
impl ::std::str::FromStr for FailJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "fail-job" => Ok(Self::FailJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FailJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FailJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FailJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FailJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"error\","]
#[doc = "    \"job_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FailJobWire {
    pub error: ::serde_json::Value,
    pub job_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub worker_id: ::std::string::String,
}
#[doc = "`FailRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"error\","]
#[doc = "    \"input_id\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"run_id\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"fail-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FailRunCommand {
    pub command: FailRunCommandCommand,
    pub error: ::serde_json::Value,
    pub input_id: ::std::string::String,
    pub lease_token: ::std::string::String,
    pub run_id: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`FailRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"fail-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FailRunCommandCommand {
    #[serde(rename = "fail-run")]
    FailRun,
}
impl ::std::fmt::Display for FailRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::FailRun => f.write_str("fail-run"),
        }
    }
}
impl ::std::str::FromStr for FailRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "fail-run" => Ok(Self::FailRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FailRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FailRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FailRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FinishConnectorSessionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"finish-connector-session\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/FinishConnectorSessionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FinishConnectorSessionCommand {
    pub command: FinishConnectorSessionCommandCommand,
    pub request: FinishConnectorSessionWire,
}
#[doc = "`FinishConnectorSessionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"finish-connector-session\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FinishConnectorSessionCommandCommand {
    #[serde(rename = "finish-connector-session")]
    FinishConnectorSession,
}
impl ::std::fmt::Display for FinishConnectorSessionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::FinishConnectorSession => f.write_str("finish-connector-session"),
        }
    }
}
impl ::std::str::FromStr for FinishConnectorSessionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "finish-connector-session" => Ok(Self::FinishConnectorSession),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FinishConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FinishConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FinishConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FinishConnectorSessionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"error\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"metadata\","]
#[doc = "    \"owner_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"owner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorFinishedSessionStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FinishConnectorSessionWire {
    pub error: ::serde_json::Value,
    pub lease_token: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub owner_id: ::std::string::String,
    pub session_id: ::std::string::String,
    pub state: ConnectorFinishedSessionStateWire,
}
#[doc = "`FinishToolExecutionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"finish-tool-execution\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/FinishToolExecutionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FinishToolExecutionCommand {
    pub command: FinishToolExecutionCommandCommand,
    pub request: FinishToolExecutionWire,
}
#[doc = "`FinishToolExecutionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"finish-tool-execution\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FinishToolExecutionCommandCommand {
    #[serde(rename = "finish-tool-execution")]
    FinishToolExecution,
}
impl ::std::fmt::Display for FinishToolExecutionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::FinishToolExecution => f.write_str("finish-tool-execution"),
        }
    }
}
impl ::std::str::FromStr for FinishToolExecutionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "finish-tool-execution" => Ok(Self::FinishToolExecution),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FinishToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FinishToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FinishToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`FinishToolExecutionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"error\","]
#[doc = "    \"execution_id\","]
#[doc = "    \"is_error\","]
#[doc = "    \"result\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"execution_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"is_error\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableBoolean\""]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"succeeded\","]
#[doc = "        \"failed\","]
#[doc = "        \"cancelled\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct FinishToolExecutionWire {
    pub error: ::serde_json::Value,
    pub execution_id: ::std::string::String,
    pub is_error: NullableBoolean,
    pub result: ::serde_json::Value,
    pub state: FinishToolExecutionWireState,
}
#[doc = "`FinishToolExecutionWireState`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum FinishToolExecutionWireState {
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for FinishToolExecutionWireState {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for FinishToolExecutionWireState {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for FinishToolExecutionWireState {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for FinishToolExecutionWireState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for FinishToolExecutionWireState {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetActiveContextEpochCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-active-context-epoch\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/GetActiveContextEpochWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetActiveContextEpochCommand {
    pub command: GetActiveContextEpochCommandCommand,
    pub request: GetActiveContextEpochWire,
}
#[doc = "`GetActiveContextEpochCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-active-context-epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetActiveContextEpochCommandCommand {
    #[serde(rename = "get-active-context-epoch")]
    GetActiveContextEpoch,
}
impl ::std::fmt::Display for GetActiveContextEpochCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetActiveContextEpoch => f.write_str("get-active-context-epoch"),
        }
    }
}
impl ::std::str::FromStr for GetActiveContextEpochCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-active-context-epoch" => Ok(Self::GetActiveContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetActiveContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetActiveContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetActiveContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetActiveContextEpochWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"policy_version\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetActiveContextEpochWire {
    pub policy_version: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`GetBudgetScopeCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"scope_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-budget-scope\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"scope_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetBudgetScopeCommand {
    pub command: GetBudgetScopeCommandCommand,
    pub scope_id: ::std::string::String,
}
#[doc = "`GetBudgetScopeCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-budget-scope\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetBudgetScopeCommandCommand {
    #[serde(rename = "get-budget-scope")]
    GetBudgetScope,
}
impl ::std::fmt::Display for GetBudgetScopeCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetBudgetScope => f.write_str("get-budget-scope"),
        }
    }
}
impl ::std::str::FromStr for GetBudgetScopeCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-budget-scope" => Ok(Self::GetBudgetScope),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetBudgetScopeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetBudgetScopeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetBudgetScopeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetConfigCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"key\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-config\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetConfigCommand {
    pub command: GetConfigCommandCommand,
    pub key: ::std::string::String,
}
#[doc = "`GetConfigCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-config\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetConfigCommandCommand {
    #[serde(rename = "get-config")]
    GetConfig,
}
impl ::std::fmt::Display for GetConfigCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetConfig => f.write_str("get-config"),
        }
    }
}
impl ::std::str::FromStr for GetConfigCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-config" => Ok(Self::GetConfig),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetDelegationGraphCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"graph_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-delegation-graph\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetDelegationGraphCommand {
    pub command: GetDelegationGraphCommandCommand,
    pub graph_id: ::std::string::String,
}
#[doc = "`GetDelegationGraphCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-delegation-graph\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetDelegationGraphCommandCommand {
    #[serde(rename = "get-delegation-graph")]
    GetDelegationGraph,
}
impl ::std::fmt::Display for GetDelegationGraphCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetDelegationGraph => f.write_str("get-delegation-graph"),
        }
    }
}
impl ::std::str::FromStr for GetDelegationGraphCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-delegation-graph" => Ok(Self::GetDelegationGraph),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetDelegationGraphNodeCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-delegation-graph-node\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/GetDelegationGraphNodeWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetDelegationGraphNodeCommand {
    pub command: GetDelegationGraphNodeCommandCommand,
    pub request: GetDelegationGraphNodeWire,
}
#[doc = "`GetDelegationGraphNodeCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-delegation-graph-node\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetDelegationGraphNodeCommandCommand {
    #[serde(rename = "get-delegation-graph-node")]
    GetDelegationGraphNode,
}
impl ::std::fmt::Display for GetDelegationGraphNodeCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetDelegationGraphNode => f.write_str("get-delegation-graph-node"),
        }
    }
}
impl ::std::str::FromStr for GetDelegationGraphNodeCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-delegation-graph-node" => Ok(Self::GetDelegationGraphNode),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetDelegationGraphNodeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"node_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"node_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetDelegationGraphNodeWire {
    pub node_id: ::std::string::String,
}
#[doc = "`GetJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/GetJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetJobCommand {
    pub command: GetJobCommandCommand,
    pub request: GetJobWire,
}
#[doc = "`GetJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetJobCommandCommand {
    #[serde(rename = "get-job")]
    GetJob,
}
impl ::std::fmt::Display for GetJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetJob => f.write_str("get-job"),
        }
    }
}
impl ::std::str::FromStr for GetJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-job" => Ok(Self::GetJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"job_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetJobWire {
    pub job_id: ::std::string::String,
}
#[doc = "`GetObjectiveRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"objective_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-objective-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetObjectiveRunCommand {
    pub command: GetObjectiveRunCommandCommand,
    pub objective_id: ::std::string::String,
}
#[doc = "`GetObjectiveRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-objective-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetObjectiveRunCommandCommand {
    #[serde(rename = "get-objective-run")]
    GetObjectiveRun,
}
impl ::std::fmt::Display for GetObjectiveRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetObjectiveRun => f.write_str("get-objective-run"),
        }
    }
}
impl ::std::str::FromStr for GetObjectiveRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-objective-run" => Ok(Self::GetObjectiveRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetPlanProposalCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"proposal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-plan-proposal\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetPlanProposalCommand {
    pub command: GetPlanProposalCommandCommand,
    pub proposal_id: ::std::string::String,
}
#[doc = "`GetPlanProposalCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-plan-proposal\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetPlanProposalCommandCommand {
    #[serde(rename = "get-plan-proposal")]
    GetPlanProposal,
}
impl ::std::fmt::Display for GetPlanProposalCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetPlanProposal => f.write_str("get-plan-proposal"),
        }
    }
}
impl ::std::str::FromStr for GetPlanProposalCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-plan-proposal" => Ok(Self::GetPlanProposal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetPluginInstallCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-plugin-install\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/GetPluginInstallWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetPluginInstallCommand {
    pub command: GetPluginInstallCommandCommand,
    pub request: GetPluginInstallWire,
}
#[doc = "`GetPluginInstallCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-plugin-install\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetPluginInstallCommandCommand {
    #[serde(rename = "get-plugin-install")]
    GetPluginInstall,
}
impl ::std::fmt::Display for GetPluginInstallCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetPluginInstall => f.write_str("get-plugin-install"),
        }
    }
}
impl ::std::str::FromStr for GetPluginInstallCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-plugin-install" => Ok(Self::GetPluginInstall),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetPluginInstallWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"plugin_id\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetPluginInstallWire {
    pub plugin_id: ::std::string::String,
    pub version: NullableString,
}
#[doc = "`GetPluginManifestCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-plugin-manifest\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/GetPluginManifestWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetPluginManifestCommand {
    pub command: GetPluginManifestCommandCommand,
    pub request: GetPluginManifestWire,
}
#[doc = "`GetPluginManifestCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-plugin-manifest\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetPluginManifestCommandCommand {
    #[serde(rename = "get-plugin-manifest")]
    GetPluginManifest,
}
impl ::std::fmt::Display for GetPluginManifestCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetPluginManifest => f.write_str("get-plugin-manifest"),
        }
    }
}
impl ::std::str::FromStr for GetPluginManifestCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-plugin-manifest" => Ok(Self::GetPluginManifest),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetPluginManifestWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"plugin_id\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetPluginManifestWire {
    pub plugin_id: ::std::string::String,
    pub version: NullableString,
}
#[doc = "`GetResourceCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"resource_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-resource\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"resource_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetResourceCommand {
    pub command: GetResourceCommandCommand,
    pub resource_id: ::std::string::String,
}
#[doc = "`GetResourceCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-resource\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetResourceCommandCommand {
    #[serde(rename = "get-resource")]
    GetResource,
}
impl ::std::fmt::Display for GetResourceCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetResource => f.write_str("get-resource"),
        }
    }
}
impl ::std::str::FromStr for GetResourceCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-resource" => Ok(Self::GetResource),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetSessionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-session\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetSessionCommand {
    pub command: GetSessionCommandCommand,
    pub id: ::std::string::String,
}
#[doc = "`GetSessionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-session\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetSessionCommandCommand {
    #[serde(rename = "get-session")]
    GetSession,
}
impl ::std::fmt::Display for GetSessionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetSession => f.write_str("get-session"),
        }
    }
}
impl ::std::str::FromStr for GetSessionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-session" => Ok(Self::GetSession),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetTeamConversationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"conversation_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-team-conversation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetTeamConversationCommand {
    pub command: GetTeamConversationCommandCommand,
    pub conversation_id: ::std::string::String,
}
#[doc = "`GetTeamConversationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-team-conversation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetTeamConversationCommandCommand {
    #[serde(rename = "get-team-conversation")]
    GetTeamConversation,
}
impl ::std::fmt::Display for GetTeamConversationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetTeamConversation => f.write_str("get-team-conversation"),
        }
    }
}
impl ::std::str::FromStr for GetTeamConversationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-team-conversation" => Ok(Self::GetTeamConversation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetToolExecutionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"execution_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-tool-execution\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"execution_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetToolExecutionCommand {
    pub command: GetToolExecutionCommandCommand,
    pub execution_id: ::std::string::String,
}
#[doc = "`GetToolExecutionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-tool-execution\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetToolExecutionCommandCommand {
    #[serde(rename = "get-tool-execution")]
    GetToolExecution,
}
impl ::std::fmt::Display for GetToolExecutionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetToolExecution => f.write_str("get-tool-execution"),
        }
    }
}
impl ::std::str::FromStr for GetToolExecutionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-tool-execution" => Ok(Self::GetToolExecution),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetWorkspaceChangeProposalCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"proposal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-workspace-change-proposal\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetWorkspaceChangeProposalCommand {
    pub command: GetWorkspaceChangeProposalCommandCommand,
    pub proposal_id: ::std::string::String,
}
#[doc = "`GetWorkspaceChangeProposalCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-workspace-change-proposal\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetWorkspaceChangeProposalCommandCommand {
    #[serde(rename = "get-workspace-change-proposal")]
    GetWorkspaceChangeProposal,
}
impl ::std::fmt::Display for GetWorkspaceChangeProposalCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetWorkspaceChangeProposal => f.write_str("get-workspace-change-proposal"),
        }
    }
}
impl ::std::str::FromStr for GetWorkspaceChangeProposalCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-workspace-change-proposal" => Ok(Self::GetWorkspaceChangeProposal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`GetWorkspaceChangeSetCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"change_set_id\","]
#[doc = "    \"command\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"change_set_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"get-workspace-change-set\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct GetWorkspaceChangeSetCommand {
    pub change_set_id: ::std::string::String,
    pub command: GetWorkspaceChangeSetCommandCommand,
}
#[doc = "`GetWorkspaceChangeSetCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"get-workspace-change-set\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum GetWorkspaceChangeSetCommandCommand {
    #[serde(rename = "get-workspace-change-set")]
    GetWorkspaceChangeSet,
}
impl ::std::fmt::Display for GetWorkspaceChangeSetCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::GetWorkspaceChangeSet => f.write_str("get-workspace-change-set"),
        }
    }
}
impl ::std::str::FromStr for GetWorkspaceChangeSetCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "get-workspace-change-set" => Ok(Self::GetWorkspaceChangeSet),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for GetWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for GetWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for GetWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`HeartbeatConnectorSessionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"heartbeat-connector-session\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/HeartbeatConnectorSessionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HeartbeatConnectorSessionCommand {
    pub command: HeartbeatConnectorSessionCommandCommand,
    pub request: HeartbeatConnectorSessionWire,
}
#[doc = "`HeartbeatConnectorSessionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"heartbeat-connector-session\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum HeartbeatConnectorSessionCommandCommand {
    #[serde(rename = "heartbeat-connector-session")]
    HeartbeatConnectorSession,
}
impl ::std::fmt::Display for HeartbeatConnectorSessionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::HeartbeatConnectorSession => f.write_str("heartbeat-connector-session"),
        }
    }
}
impl ::std::str::FromStr for HeartbeatConnectorSessionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "heartbeat-connector-session" => Ok(Self::HeartbeatConnectorSession),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HeartbeatConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for HeartbeatConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeartbeatConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`HeartbeatConnectorSessionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"lease_ms\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"metadata\","]
#[doc = "    \"owner_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"owner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableConnectorLiveSessionStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HeartbeatConnectorSessionWire {
    pub lease_ms: i64,
    pub lease_token: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub owner_id: ::std::string::String,
    pub session_id: ::std::string::String,
    pub state: NullableConnectorLiveSessionStateWire,
}
#[doc = "`HeartbeatJobCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"heartbeat-job\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/HeartbeatJobWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HeartbeatJobCommand {
    pub command: HeartbeatJobCommandCommand,
    pub request: HeartbeatJobWire,
}
#[doc = "`HeartbeatJobCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"heartbeat-job\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum HeartbeatJobCommandCommand {
    #[serde(rename = "heartbeat-job")]
    HeartbeatJob,
}
impl ::std::fmt::Display for HeartbeatJobCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::HeartbeatJob => f.write_str("heartbeat-job"),
        }
    }
}
impl ::std::str::FromStr for HeartbeatJobCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "heartbeat-job" => Ok(Self::HeartbeatJob),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HeartbeatJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for HeartbeatJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeartbeatJobCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`HeartbeatJobWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"job_id\","]
#[doc = "    \"lease_ms\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HeartbeatJobWire {
    pub job_id: ::std::string::String,
    pub lease_ms: i64,
    pub lease_token: ::std::string::String,
    pub worker_id: ::std::string::String,
}
#[doc = "`HeartbeatRunnerCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"lease_ms\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"heartbeat-runner\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct HeartbeatRunnerCommand {
    pub command: HeartbeatRunnerCommandCommand,
    pub lease_ms: i64,
    pub lease_token: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`HeartbeatRunnerCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"heartbeat-runner\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum HeartbeatRunnerCommandCommand {
    #[serde(rename = "heartbeat-runner")]
    HeartbeatRunner,
}
impl ::std::fmt::Display for HeartbeatRunnerCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::HeartbeatRunner => f.write_str("heartbeat-runner"),
        }
    }
}
impl ::std::str::FromStr for HeartbeatRunnerCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "heartbeat-runner" => Ok(Self::HeartbeatRunner),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for HeartbeatRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for HeartbeatRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for HeartbeatRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`IngestChannelInboundEventCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"ingest-channel-inbound-event\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/IngestChannelInboundEventWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct IngestChannelInboundEventCommand {
    pub command: IngestChannelInboundEventCommandCommand,
    pub request: IngestChannelInboundEventWire,
}
#[doc = "`IngestChannelInboundEventCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"ingest-channel-inbound-event\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum IngestChannelInboundEventCommandCommand {
    #[serde(rename = "ingest-channel-inbound-event")]
    IngestChannelInboundEvent,
}
impl ::std::fmt::Display for IngestChannelInboundEventCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::IngestChannelInboundEvent => f.write_str("ingest-channel-inbound-event"),
        }
    }
}
impl ::std::str::FromStr for IngestChannelInboundEventCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "ingest-channel-inbound-event" => Ok(Self::IngestChannelInboundEvent),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for IngestChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for IngestChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for IngestChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`IngestChannelInboundEventWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"channel_id\","]
#[doc = "    \"channel_kind\","]
#[doc = "    \"connector_id\","]
#[doc = "    \"external_event_id\","]
#[doc = "    \"external_thread_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"payload\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"received_at\","]
#[doc = "    \"sender_external_identity_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"channel_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"channel_kind\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"external_event_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"external_thread_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"received_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"sender_external_identity_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct IngestChannelInboundEventWire {
    pub channel_id: ::std::string::String,
    pub channel_kind: ::std::string::String,
    pub connector_id: ::std::string::String,
    pub external_event_id: ::std::string::String,
    pub external_thread_id: NullableString,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub payload: ::serde_json::Value,
    pub principal_id: NullableString,
    pub received_at: NullableInteger,
    pub sender_external_identity_id: ::std::string::String,
}
#[doc = "`IngestResourceCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"ingest-resource\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/IngestResourceWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct IngestResourceCommand {
    pub command: IngestResourceCommandCommand,
    pub request: IngestResourceWire,
}
#[doc = "`IngestResourceCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"ingest-resource\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum IngestResourceCommandCommand {
    #[serde(rename = "ingest-resource")]
    IngestResource,
}
impl ::std::fmt::Display for IngestResourceCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::IngestResource => f.write_str("ingest-resource"),
        }
    }
}
impl ::std::str::FromStr for IngestResourceCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "ingest-resource" => Ok(Self::IngestResource),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for IngestResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for IngestResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for IngestResourceCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`IngestResourceWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"content_base64\","]
#[doc = "    \"duration_ms\","]
#[doc = "    \"expected_sha256\","]
#[doc = "    \"height\","]
#[doc = "    \"id\","]
#[doc = "    \"kind\","]
#[doc = "    \"label\","]
#[doc = "    \"logical_path\","]
#[doc = "    \"media_type\","]
#[doc = "    \"metadata\","]
#[doc = "    \"origin\","]
#[doc = "    \"source\","]
#[doc = "    \"width\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"content_base64\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"duration_ms\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"expected_sha256\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"height\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceKindWire\""]
#[doc = "    },"]
#[doc = "    \"label\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"logical_path\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"media_type\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceOriginWire\""]
#[doc = "    },"]
#[doc = "    \"source\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceSourceWire\""]
#[doc = "    },"]
#[doc = "    \"width\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct IngestResourceWire {
    pub content_base64: ::std::string::String,
    pub duration_ms: NullableInteger,
    pub expected_sha256: NullableString,
    pub height: NullableInteger,
    pub id: NullableString,
    pub kind: NullableResourceKindWire,
    pub label: NullableString,
    pub logical_path: NullableString,
    pub media_type: NullableString,
    pub metadata: ::serde_json::Value,
    pub origin: NullableResourceOriginWire,
    pub source: NullableResourceSourceWire,
    pub width: NullableInteger,
}
#[doc = "`InterruptSessionRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"interrupt-session-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/InterruptSessionRunWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct InterruptSessionRunCommand {
    pub command: InterruptSessionRunCommandCommand,
    pub request: InterruptSessionRunWire,
}
#[doc = "`InterruptSessionRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"interrupt-session-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum InterruptSessionRunCommandCommand {
    #[serde(rename = "interrupt-session-run")]
    InterruptSessionRun,
}
impl ::std::fmt::Display for InterruptSessionRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::InterruptSessionRun => f.write_str("interrupt-session-run"),
        }
    }
}
impl ::std::str::FromStr for InterruptSessionRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "interrupt-session-run" => Ok(Self::InterruptSessionRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for InterruptSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for InterruptSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for InterruptSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`InterruptSessionRunWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"origin\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"reason\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableJsonObjectWire\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputOriginWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct InterruptSessionRunWire {
    pub idempotency_key: NullableString,
    pub metadata: NullableJsonObjectWire,
    pub origin: NullableSessionInputOriginWire,
    pub principal_id: NullableString,
    pub reason: ::std::string::String,
    pub run_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`JsonObjectWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"additionalProperties\": {"]
#[doc = "    \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct JsonObjectWire(
    pub ::std::collections::HashMap<::std::string::String, ::serde_json::Value>,
);
impl ::std::ops::Deref for JsonObjectWire {
    type Target = ::std::collections::HashMap<::std::string::String, ::serde_json::Value>;
    fn deref(&self) -> &::std::collections::HashMap<::std::string::String, ::serde_json::Value> {
        &self.0
    }
}
impl ::std::convert::From<JsonObjectWire>
    for ::std::collections::HashMap<::std::string::String, ::serde_json::Value>
{
    fn from(value: JsonObjectWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::collections::HashMap<::std::string::String, ::serde_json::Value>>
    for JsonObjectWire
{
    fn from(
        value: ::std::collections::HashMap<::std::string::String, ::serde_json::Value>,
    ) -> Self {
        Self(value)
    }
}
#[doc = "`ListBudgetGrantsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"scope_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-budget-grants\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"scope_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListBudgetGrantsCommand {
    pub command: ListBudgetGrantsCommandCommand,
    pub scope_id: ::std::string::String,
}
#[doc = "`ListBudgetGrantsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-budget-grants\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListBudgetGrantsCommandCommand {
    #[serde(rename = "list-budget-grants")]
    ListBudgetGrants,
}
impl ::std::fmt::Display for ListBudgetGrantsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListBudgetGrants => f.write_str("list-budget-grants"),
        }
    }
}
impl ::std::str::FromStr for ListBudgetGrantsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-budget-grants" => Ok(Self::ListBudgetGrants),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListBudgetGrantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListBudgetGrantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListBudgetGrantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListChannelBindingsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-channel-bindings\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelBindingsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelBindingsCommand {
    pub command: ListChannelBindingsCommandCommand,
    pub request: ListChannelBindingsWire,
}
#[doc = "`ListChannelBindingsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-channel-bindings\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListChannelBindingsCommandCommand {
    #[serde(rename = "list-channel-bindings")]
    ListChannelBindings,
}
impl ::std::fmt::Display for ListChannelBindingsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListChannelBindings => f.write_str("list-channel-bindings"),
        }
    }
}
impl ::std::str::FromStr for ListChannelBindingsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-channel-bindings" => Ok(Self::ListChannelBindings),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListChannelBindingsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListChannelBindingsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListChannelBindingsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListChannelBindingsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"channel_id\","]
#[doc = "    \"channel_kind\","]
#[doc = "    \"connector_id\","]
#[doc = "    \"external_identity_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"channel_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"channel_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"external_identity_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableChannelBindingStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelBindingsWire {
    pub channel_id: NullableString,
    pub channel_kind: NullableString,
    pub connector_id: NullableString,
    pub external_identity_id: NullableString,
    pub limit: NullableInteger,
    pub principal_id: NullableString,
    pub state: NullableChannelBindingStateWire,
}
#[doc = "`ListChannelInboundEventsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-channel-inbound-events\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelInboundEventsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelInboundEventsCommand {
    pub command: ListChannelInboundEventsCommandCommand,
    pub request: ListChannelInboundEventsWire,
}
#[doc = "`ListChannelInboundEventsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-channel-inbound-events\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListChannelInboundEventsCommandCommand {
    #[serde(rename = "list-channel-inbound-events")]
    ListChannelInboundEvents,
}
impl ::std::fmt::Display for ListChannelInboundEventsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListChannelInboundEvents => f.write_str("list-channel-inbound-events"),
        }
    }
}
impl ::std::str::FromStr for ListChannelInboundEventsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-channel-inbound-events" => Ok(Self::ListChannelInboundEvents),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListChannelInboundEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListChannelInboundEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListChannelInboundEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListChannelInboundEventsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"after_received_at\","]
#[doc = "    \"channel_id\","]
#[doc = "    \"channel_kind\","]
#[doc = "    \"connector_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"after_received_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"channel_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"channel_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableChannelInboundEventStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelInboundEventsWire {
    pub after_received_at: NullableInteger,
    pub channel_id: NullableString,
    pub channel_kind: NullableString,
    pub connector_id: NullableString,
    pub limit: NullableInteger,
    pub state: NullableChannelInboundEventStateWire,
}
#[doc = "`ListChannelProjectionsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-channel-projections\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListChannelProjectionsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelProjectionsCommand {
    pub command: ListChannelProjectionsCommandCommand,
    pub request: ListChannelProjectionsWire,
}
#[doc = "`ListChannelProjectionsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-channel-projections\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListChannelProjectionsCommandCommand {
    #[serde(rename = "list-channel-projections")]
    ListChannelProjections,
}
impl ::std::fmt::Display for ListChannelProjectionsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListChannelProjections => f.write_str("list-channel-projections"),
        }
    }
}
impl ::std::str::FromStr for ListChannelProjectionsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-channel-projections" => Ok(Self::ListChannelProjections),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListChannelProjectionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListChannelProjectionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListChannelProjectionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListChannelProjectionsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"inbound_event_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"target_kind\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"inbound_event_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"target_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableChannelProjectionTargetKindWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListChannelProjectionsWire {
    pub inbound_event_id: NullableString,
    pub limit: NullableInteger,
    pub target_kind: NullableChannelProjectionTargetKindWire,
}
#[doc = "`ListConnectorCredentialsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-connector-credentials\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorCredentialsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorCredentialsCommand {
    pub command: ListConnectorCredentialsCommandCommand,
    pub request: ListConnectorCredentialsWire,
}
#[doc = "`ListConnectorCredentialsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-connector-credentials\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListConnectorCredentialsCommandCommand {
    #[serde(rename = "list-connector-credentials")]
    ListConnectorCredentials,
}
impl ::std::fmt::Display for ListConnectorCredentialsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListConnectorCredentials => f.write_str("list-connector-credentials"),
        }
    }
}
impl ::std::str::FromStr for ListConnectorCredentialsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-connector-credentials" => Ok(Self::ListConnectorCredentials),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListConnectorCredentialsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListConnectorCredentialsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListConnectorCredentialsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListConnectorCredentialsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableConnectorCredentialStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorCredentialsWire {
    pub connector_id: NullableString,
    pub limit: NullableInteger,
    pub state: NullableConnectorCredentialStateWire,
}
#[doc = "`ListConnectorRegistrationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-connector-registrations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorRegistrationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorRegistrationsCommand {
    pub command: ListConnectorRegistrationsCommandCommand,
    pub request: ListConnectorRegistrationsWire,
}
#[doc = "`ListConnectorRegistrationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-connector-registrations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListConnectorRegistrationsCommandCommand {
    #[serde(rename = "list-connector-registrations")]
    ListConnectorRegistrations,
}
impl ::std::fmt::Display for ListConnectorRegistrationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListConnectorRegistrations => f.write_str("list-connector-registrations"),
        }
    }
}
impl ::std::str::FromStr for ListConnectorRegistrationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-connector-registrations" => Ok(Self::ListConnectorRegistrations),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListConnectorRegistrationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListConnectorRegistrationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListConnectorRegistrationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListConnectorRegistrationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableConnectorRegistrationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorRegistrationsWire {
    pub connector_id: NullableString,
    pub limit: NullableInteger,
    pub plugin_id: NullableString,
    pub state: NullableConnectorRegistrationStateWire,
}
#[doc = "`ListConnectorSessionsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-connector-sessions\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListConnectorSessionsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorSessionsCommand {
    pub command: ListConnectorSessionsCommandCommand,
    pub request: ListConnectorSessionsWire,
}
#[doc = "`ListConnectorSessionsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-connector-sessions\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListConnectorSessionsCommandCommand {
    #[serde(rename = "list-connector-sessions")]
    ListConnectorSessions,
}
impl ::std::fmt::Display for ListConnectorSessionsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListConnectorSessions => f.write_str("list-connector-sessions"),
        }
    }
}
impl ::std::str::FromStr for ListConnectorSessionsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-connector-sessions" => Ok(Self::ListConnectorSessions),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListConnectorSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListConnectorSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListConnectorSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListConnectorSessionsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"owner_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"owner_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableConnectorSessionStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListConnectorSessionsWire {
    pub connector_id: NullableString,
    pub limit: NullableInteger,
    pub owner_id: NullableString,
    pub state: NullableConnectorSessionStateWire,
}
#[doc = "`ListContextEpochsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-context-epochs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListContextEpochsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListContextEpochsCommand {
    pub command: ListContextEpochsCommandCommand,
    pub request: ListContextEpochsWire,
}
#[doc = "`ListContextEpochsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-context-epochs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListContextEpochsCommandCommand {
    #[serde(rename = "list-context-epochs")]
    ListContextEpochs,
}
impl ::std::fmt::Display for ListContextEpochsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListContextEpochs => f.write_str("list-context-epochs"),
        }
    }
}
impl ::std::str::FromStr for ListContextEpochsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-context-epochs" => Ok(Self::ListContextEpochs),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListContextEpochsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"policy_version\","]
#[doc = "    \"session_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableContextEpochStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListContextEpochsWire {
    pub policy_version: NullableString,
    pub session_id: ::std::string::String,
    pub state: NullableContextEpochStateWire,
}
#[doc = "`ListContextReplacementsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-context-replacements\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListContextReplacementsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListContextReplacementsCommand {
    pub command: ListContextReplacementsCommandCommand,
    pub request: ListContextReplacementsWire,
}
#[doc = "`ListContextReplacementsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-context-replacements\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListContextReplacementsCommandCommand {
    #[serde(rename = "list-context-replacements")]
    ListContextReplacements,
}
impl ::std::fmt::Display for ListContextReplacementsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListContextReplacements => f.write_str("list-context-replacements"),
        }
    }
}
impl ::std::str::FromStr for ListContextReplacementsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-context-replacements" => Ok(Self::ListContextReplacements),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListContextReplacementsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListContextReplacementsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListContextReplacementsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListContextReplacementsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"epoch_id\","]
#[doc = "    \"policy_version\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"epoch_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListContextReplacementsWire {
    pub epoch_id: NullableString,
    pub policy_version: NullableString,
    pub session_id: ::std::string::String,
}
#[doc = "`ListDelegationGraphDependenciesCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-delegation-graph-dependencies\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphDependenciesWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphDependenciesCommand {
    pub command: ListDelegationGraphDependenciesCommandCommand,
    pub request: ListDelegationGraphDependenciesWire,
}
#[doc = "`ListDelegationGraphDependenciesCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-delegation-graph-dependencies\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListDelegationGraphDependenciesCommandCommand {
    #[serde(rename = "list-delegation-graph-dependencies")]
    ListDelegationGraphDependencies,
}
impl ::std::fmt::Display for ListDelegationGraphDependenciesCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListDelegationGraphDependencies => {
                f.write_str("list-delegation-graph-dependencies")
            }
        }
    }
}
impl ::std::str::FromStr for ListDelegationGraphDependenciesCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-delegation-graph-dependencies" => Ok(Self::ListDelegationGraphDependencies),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListDelegationGraphDependenciesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for ListDelegationGraphDependenciesCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ListDelegationGraphDependenciesCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListDelegationGraphDependenciesWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"graph_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphDependenciesWire {
    pub graph_id: ::std::string::String,
}
#[doc = "`ListDelegationGraphNodesCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-delegation-graph-nodes\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphNodesWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphNodesCommand {
    pub command: ListDelegationGraphNodesCommandCommand,
    pub request: ListDelegationGraphNodesWire,
}
#[doc = "`ListDelegationGraphNodesCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-delegation-graph-nodes\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListDelegationGraphNodesCommandCommand {
    #[serde(rename = "list-delegation-graph-nodes")]
    ListDelegationGraphNodes,
}
impl ::std::fmt::Display for ListDelegationGraphNodesCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListDelegationGraphNodes => f.write_str("list-delegation-graph-nodes"),
        }
    }
}
impl ::std::str::FromStr for ListDelegationGraphNodesCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-delegation-graph-nodes" => Ok(Self::ListDelegationGraphNodes),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListDelegationGraphNodesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListDelegationGraphNodesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListDelegationGraphNodesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListDelegationGraphNodesWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"graph_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableDelegationNodeStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphNodesWire {
    pub graph_id: ::std::string::String,
    pub state: NullableDelegationNodeStateWire,
}
#[doc = "`ListDelegationGraphsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-delegation-graphs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListDelegationGraphsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphsCommand {
    pub command: ListDelegationGraphsCommandCommand,
    pub request: ListDelegationGraphsWire,
}
#[doc = "`ListDelegationGraphsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-delegation-graphs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListDelegationGraphsCommandCommand {
    #[serde(rename = "list-delegation-graphs")]
    ListDelegationGraphs,
}
impl ::std::fmt::Display for ListDelegationGraphsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListDelegationGraphs => f.write_str("list-delegation-graphs"),
        }
    }
}
impl ::std::str::FromStr for ListDelegationGraphsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-delegation-graphs" => Ok(Self::ListDelegationGraphs),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListDelegationGraphsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListDelegationGraphsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListDelegationGraphsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListDelegationGraphsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableDelegationGraphStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListDelegationGraphsWire {
    pub limit: NullableInteger,
    pub principal_id: NullableString,
    pub state: NullableDelegationGraphStateWire,
}
#[doc = "`ListJobsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-jobs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListJobsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListJobsCommand {
    pub command: ListJobsCommandCommand,
    pub request: ListJobsWire,
}
#[doc = "`ListJobsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-jobs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListJobsCommandCommand {
    #[serde(rename = "list-jobs")]
    ListJobs,
}
impl ::std::fmt::Display for ListJobsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListJobs => f.write_str("list-jobs"),
        }
    }
}
impl ::std::str::FromStr for ListJobsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-jobs" => Ok(Self::ListJobs),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListJobsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListJobsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListJobsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListJobsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\","]
#[doc = "    \"limit\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSchedulerJobKindWire\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableUnsigned32\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSchedulerJobStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListJobsWire {
    pub kind: NullableSchedulerJobKindWire,
    pub limit: NullableUnsigned32,
    pub state: NullableSchedulerJobStateWire,
}
#[doc = "`ListObjectiveAttemptsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-objective-attempts\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveAttemptsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveAttemptsCommand {
    pub command: ListObjectiveAttemptsCommandCommand,
    pub request: ListObjectiveAttemptsWire,
}
#[doc = "`ListObjectiveAttemptsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-objective-attempts\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListObjectiveAttemptsCommandCommand {
    #[serde(rename = "list-objective-attempts")]
    ListObjectiveAttempts,
}
impl ::std::fmt::Display for ListObjectiveAttemptsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListObjectiveAttempts => f.write_str("list-objective-attempts"),
        }
    }
}
impl ::std::str::FromStr for ListObjectiveAttemptsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-objective-attempts" => Ok(Self::ListObjectiveAttempts),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListObjectiveAttemptsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListObjectiveAttemptsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListObjectiveAttemptsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListObjectiveAttemptsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableObjectiveAttemptStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveAttemptsWire {
    pub limit: NullableInteger,
    pub objective_id: ::std::string::String,
    pub state: NullableObjectiveAttemptStateWire,
}
#[doc = "`ListObjectiveRunOperationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-objective-run-operations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveRunOperationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveRunOperationsCommand {
    pub command: ListObjectiveRunOperationsCommandCommand,
    pub request: ListObjectiveRunOperationsWire,
}
#[doc = "`ListObjectiveRunOperationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-objective-run-operations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListObjectiveRunOperationsCommandCommand {
    #[serde(rename = "list-objective-run-operations")]
    ListObjectiveRunOperations,
}
impl ::std::fmt::Display for ListObjectiveRunOperationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListObjectiveRunOperations => f.write_str("list-objective-run-operations"),
        }
    }
}
impl ::std::str::FromStr for ListObjectiveRunOperationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-objective-run-operations" => Ok(Self::ListObjectiveRunOperations),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListObjectiveRunOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListObjectiveRunOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListObjectiveRunOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListObjectiveRunOperationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"objective_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveRunOperationsWire {
    pub objective_id: ::std::string::String,
}
#[doc = "`ListObjectiveRunsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-objective-runs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveRunsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveRunsCommand {
    pub command: ListObjectiveRunsCommandCommand,
    pub request: ListObjectiveRunsWire,
}
#[doc = "`ListObjectiveRunsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-objective-runs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListObjectiveRunsCommandCommand {
    #[serde(rename = "list-objective-runs")]
    ListObjectiveRuns,
}
impl ::std::fmt::Display for ListObjectiveRunsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListObjectiveRuns => f.write_str("list-objective-runs"),
        }
    }
}
impl ::std::str::FromStr for ListObjectiveRunsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-objective-runs" => Ok(Self::ListObjectiveRuns),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListObjectiveRunsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListObjectiveRunsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListObjectiveRunsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListObjectiveRunsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"reference_id\","]
#[doc = "    \"reference_kind\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"reference_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"reference_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableObjectiveReferenceKindWire\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableObjectiveRunStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveRunsWire {
    pub limit: NullableInteger,
    pub principal_id: NullableString,
    pub reference_id: NullableString,
    pub reference_kind: NullableObjectiveReferenceKindWire,
    pub state: NullableObjectiveRunStateWire,
}
#[doc = "`ListObjectiveVerificationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-objective-verifications\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveVerificationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveVerificationsCommand {
    pub command: ListObjectiveVerificationsCommandCommand,
    pub request: ListObjectiveVerificationsWire,
}
#[doc = "`ListObjectiveVerificationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-objective-verifications\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListObjectiveVerificationsCommandCommand {
    #[serde(rename = "list-objective-verifications")]
    ListObjectiveVerifications,
}
impl ::std::fmt::Display for ListObjectiveVerificationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListObjectiveVerifications => f.write_str("list-objective-verifications"),
        }
    }
}
impl ::std::str::FromStr for ListObjectiveVerificationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-objective-verifications" => Ok(Self::ListObjectiveVerifications),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListObjectiveVerificationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListObjectiveVerificationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListObjectiveVerificationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListObjectiveVerificationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"attempt_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"attempt_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableObjectiveVerificationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListObjectiveVerificationsWire {
    pub attempt_id: NullableString,
    pub limit: NullableInteger,
    pub objective_id: ::std::string::String,
    pub state: NullableObjectiveVerificationStateWire,
}
#[doc = "`ListPlanProposalOperationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-plan-proposal-operations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListPlanProposalOperationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPlanProposalOperationsCommand {
    pub command: ListPlanProposalOperationsCommandCommand,
    pub request: ListPlanProposalOperationsWire,
}
#[doc = "`ListPlanProposalOperationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-plan-proposal-operations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListPlanProposalOperationsCommandCommand {
    #[serde(rename = "list-plan-proposal-operations")]
    ListPlanProposalOperations,
}
impl ::std::fmt::Display for ListPlanProposalOperationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListPlanProposalOperations => f.write_str("list-plan-proposal-operations"),
        }
    }
}
impl ::std::str::FromStr for ListPlanProposalOperationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-plan-proposal-operations" => Ok(Self::ListPlanProposalOperations),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListPlanProposalOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListPlanProposalOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListPlanProposalOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListPlanProposalOperationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"proposal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPlanProposalOperationsWire {
    pub proposal_id: ::std::string::String,
}
#[doc = "`ListPlanProposalsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-plan-proposals\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListPlanProposalsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPlanProposalsCommand {
    pub command: ListPlanProposalsCommandCommand,
    pub request: ListPlanProposalsWire,
}
#[doc = "`ListPlanProposalsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-plan-proposals\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListPlanProposalsCommandCommand {
    #[serde(rename = "list-plan-proposals")]
    ListPlanProposals,
}
impl ::std::fmt::Display for ListPlanProposalsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListPlanProposals => f.write_str("list-plan-proposals"),
        }
    }
}
impl ::std::str::FromStr for ListPlanProposalsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-plan-proposals" => Ok(Self::ListPlanProposals),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListPlanProposalsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListPlanProposalsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListPlanProposalsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListPlanProposalsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"reference_id\","]
#[doc = "    \"reference_kind\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"reference_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"reference_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePlanReferenceKindWire\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePlanProposalStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPlanProposalsWire {
    pub limit: NullableInteger,
    pub principal_id: NullableString,
    pub reference_id: NullableString,
    pub reference_kind: NullablePlanReferenceKindWire,
    pub state: NullablePlanProposalStateWire,
}
#[doc = "`ListPluginInstallsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-plugin-installs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListPluginInstallsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPluginInstallsCommand {
    pub command: ListPluginInstallsCommandCommand,
    pub request: ListPluginInstallsWire,
}
#[doc = "`ListPluginInstallsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-plugin-installs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListPluginInstallsCommandCommand {
    #[serde(rename = "list-plugin-installs")]
    ListPluginInstalls,
}
impl ::std::fmt::Display for ListPluginInstallsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListPluginInstalls => f.write_str("list-plugin-installs"),
        }
    }
}
impl ::std::str::FromStr for ListPluginInstallsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-plugin-installs" => Ok(Self::ListPluginInstalls),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListPluginInstallsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListPluginInstallsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListPluginInstallsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListPluginInstallsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePluginInstallStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPluginInstallsWire {
    pub limit: NullableInteger,
    pub plugin_id: NullableString,
    pub state: NullablePluginInstallStateWire,
}
#[doc = "`ListPluginManifestsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-plugin-manifests\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListPluginManifestsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPluginManifestsCommand {
    pub command: ListPluginManifestsCommandCommand,
    pub request: ListPluginManifestsWire,
}
#[doc = "`ListPluginManifestsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-plugin-manifests\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListPluginManifestsCommandCommand {
    #[serde(rename = "list-plugin-manifests")]
    ListPluginManifests,
}
impl ::std::fmt::Display for ListPluginManifestsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListPluginManifests => f.write_str("list-plugin-manifests"),
        }
    }
}
impl ::std::str::FromStr for ListPluginManifestsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-plugin-manifests" => Ok(Self::ListPluginManifests),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListPluginManifestsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListPluginManifestsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListPluginManifestsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListPluginManifestsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"capability\","]
#[doc = "    \"limit\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"capability\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePluginCapabilityWire\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePluginManifestStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListPluginManifestsWire {
    pub capability: NullablePluginCapabilityWire,
    pub limit: NullableInteger,
    pub state: NullablePluginManifestStateWire,
}
#[doc = "`ListReadyDelegationGraphNodesCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-ready-delegation-graph-nodes\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListReadyDelegationGraphNodesWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListReadyDelegationGraphNodesCommand {
    pub command: ListReadyDelegationGraphNodesCommandCommand,
    pub request: ListReadyDelegationGraphNodesWire,
}
#[doc = "`ListReadyDelegationGraphNodesCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-ready-delegation-graph-nodes\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListReadyDelegationGraphNodesCommandCommand {
    #[serde(rename = "list-ready-delegation-graph-nodes")]
    ListReadyDelegationGraphNodes,
}
impl ::std::fmt::Display for ListReadyDelegationGraphNodesCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListReadyDelegationGraphNodes => f.write_str("list-ready-delegation-graph-nodes"),
        }
    }
}
impl ::std::str::FromStr for ListReadyDelegationGraphNodesCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-ready-delegation-graph-nodes" => Ok(Self::ListReadyDelegationGraphNodes),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListReadyDelegationGraphNodesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for ListReadyDelegationGraphNodesCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ListReadyDelegationGraphNodesCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListReadyDelegationGraphNodesWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"graph_id\","]
#[doc = "    \"limit\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListReadyDelegationGraphNodesWire {
    pub graph_id: ::std::string::String,
    pub limit: NullableInteger,
}
#[doc = "`ListResourcesCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-resources\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListResourcesWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListResourcesCommand {
    pub command: ListResourcesCommandCommand,
    pub request: ListResourcesWire,
}
#[doc = "`ListResourcesCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-resources\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListResourcesCommandCommand {
    #[serde(rename = "list-resources")]
    ListResources,
}
impl ::std::fmt::Display for ListResourcesCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListResources => f.write_str("list-resources"),
        }
    }
}
impl ::std::str::FromStr for ListResourcesCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-resources" => Ok(Self::ListResources),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListResourcesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListResourcesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListResourcesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListResourcesWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\","]
#[doc = "    \"limit\","]
#[doc = "    \"origin\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceKindWire\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableUnsigned32\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceOriginWire\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableResourceStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListResourcesWire {
    pub kind: NullableResourceKindWire,
    pub limit: NullableUnsigned32,
    pub origin: NullableResourceOriginWire,
    pub state: NullableResourceStateWire,
}
#[doc = "`ListSessionInputsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-session-inputs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionInputsCommand {
    pub command: ListSessionInputsCommandCommand,
    pub session_id: ::std::string::String,
}
#[doc = "`ListSessionInputsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-session-inputs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListSessionInputsCommandCommand {
    #[serde(rename = "list-session-inputs")]
    ListSessionInputs,
}
impl ::std::fmt::Display for ListSessionInputsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListSessionInputs => f.write_str("list-session-inputs"),
        }
    }
}
impl ::std::str::FromStr for ListSessionInputsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-session-inputs" => Ok(Self::ListSessionInputs),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListSessionInputsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListSessionInputsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListSessionInputsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListSessionMessagesCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-session-messages\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionMessagesCommand {
    pub command: ListSessionMessagesCommandCommand,
    pub session_id: ::std::string::String,
}
#[doc = "`ListSessionMessagesCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-session-messages\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListSessionMessagesCommandCommand {
    #[serde(rename = "list-session-messages")]
    ListSessionMessages,
}
impl ::std::fmt::Display for ListSessionMessagesCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListSessionMessages => f.write_str("list-session-messages"),
        }
    }
}
impl ::std::str::FromStr for ListSessionMessagesCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-session-messages" => Ok(Self::ListSessionMessages),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListSessionMessagesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListSessionMessagesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListSessionMessagesCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListSessionRunControlsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-session-run-controls\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionRunControlsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionRunControlsCommand {
    pub command: ListSessionRunControlsCommandCommand,
    pub request: ListSessionRunControlsWire,
}
#[doc = "`ListSessionRunControlsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-session-run-controls\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListSessionRunControlsCommandCommand {
    #[serde(rename = "list-session-run-controls")]
    ListSessionRunControls,
}
impl ::std::fmt::Display for ListSessionRunControlsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListSessionRunControls => f.write_str("list-session-run-controls"),
        }
    }
}
impl ::std::str::FromStr for ListSessionRunControlsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-session-run-controls" => Ok(Self::ListSessionRunControls),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListSessionRunControlsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListSessionRunControlsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListSessionRunControlsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListSessionRunControlsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\","]
#[doc = "    \"limit\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"status\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionRunControlKindWire\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"status\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionRunControlStatusWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionRunControlsWire {
    pub kind: NullableSessionRunControlKindWire,
    pub limit: NullableInteger,
    pub run_id: NullableString,
    pub session_id: ::std::string::String,
    pub status: NullableSessionRunControlStatusWire,
}
#[doc = "`ListSessionsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-sessions\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionsCommand {
    pub command: ListSessionsCommandCommand,
    pub request: ListSessionsWire,
}
#[doc = "`ListSessionsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-sessions\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListSessionsCommandCommand {
    #[serde(rename = "list-sessions")]
    ListSessions,
}
impl ::std::fmt::Display for ListSessionsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListSessions => f.write_str("list-sessions"),
        }
    }
}
impl ::std::str::FromStr for ListSessionsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-sessions" => Ok(Self::ListSessions),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListSessionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListSessionsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\","]
#[doc = "    \"limit\","]
#[doc = "    \"status\","]
#[doc = "    \"updated_after\","]
#[doc = "    \"updated_before\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionKindWire\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableUnsigned32\""]
#[doc = "    },"]
#[doc = "    \"status\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionStatusWire\""]
#[doc = "    },"]
#[doc = "    \"updated_after\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"updated_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListSessionsWire {
    pub kind: NullableSessionKindWire,
    pub limit: NullableUnsigned32,
    pub status: NullableSessionStatusWire,
    pub updated_after: NullableInteger,
    pub updated_before: NullableInteger,
}
#[doc = "`ListTeamConversationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-team-conversations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamConversationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamConversationsCommand {
    pub command: ListTeamConversationsCommandCommand,
    pub request: ListTeamConversationsWire,
}
#[doc = "`ListTeamConversationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-team-conversations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListTeamConversationsCommandCommand {
    #[serde(rename = "list-team-conversations")]
    ListTeamConversations,
}
impl ::std::fmt::Display for ListTeamConversationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListTeamConversations => f.write_str("list-team-conversations"),
        }
    }
}
impl ::std::str::FromStr for ListTeamConversationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-team-conversations" => Ok(Self::ListTeamConversations),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListTeamConversationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListTeamConversationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListTeamConversationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListTeamConversationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"mode\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"mode\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamConversationModeWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamConversationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamConversationsWire {
    pub limit: NullableInteger,
    pub mode: NullableTeamConversationModeWire,
    pub principal_id: NullableString,
    pub state: NullableTeamConversationStateWire,
}
#[doc = "`ListTeamParticipantsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-team-participants\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamParticipantsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamParticipantsCommand {
    pub command: ListTeamParticipantsCommandCommand,
    pub request: ListTeamParticipantsWire,
}
#[doc = "`ListTeamParticipantsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-team-participants\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListTeamParticipantsCommandCommand {
    #[serde(rename = "list-team-participants")]
    ListTeamParticipants,
}
impl ::std::fmt::Display for ListTeamParticipantsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListTeamParticipants => f.write_str("list-team-participants"),
        }
    }
}
impl ::std::str::FromStr for ListTeamParticipantsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-team-participants" => Ok(Self::ListTeamParticipants),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListTeamParticipantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListTeamParticipantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListTeamParticipantsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListTeamParticipantsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"conversation_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamParticipantStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamParticipantsWire {
    pub conversation_id: ::std::string::String,
    pub state: NullableTeamParticipantStateWire,
}
#[doc = "`ListTeamTurnsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-team-turns\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamTurnsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamTurnsCommand {
    pub command: ListTeamTurnsCommandCommand,
    pub request: ListTeamTurnsWire,
}
#[doc = "`ListTeamTurnsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-team-turns\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListTeamTurnsCommandCommand {
    #[serde(rename = "list-team-turns")]
    ListTeamTurns,
}
impl ::std::fmt::Display for ListTeamTurnsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListTeamTurns => f.write_str("list-team-turns"),
        }
    }
}
impl ::std::str::FromStr for ListTeamTurnsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-team-turns" => Ok(Self::ListTeamTurns),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListTeamTurnsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListTeamTurnsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListTeamTurnsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListTeamTurnsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"after_created_at\","]
#[doc = "    \"after_turn_id\","]
#[doc = "    \"conversation_id\","]
#[doc = "    \"limit\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"after_created_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"after_turn_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListTeamTurnsWire {
    pub after_created_at: NullableInteger,
    pub after_turn_id: NullableString,
    pub conversation_id: ::std::string::String,
    pub limit: NullableInteger,
}
#[doc = "`ListToolExecutionsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-tool-executions\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListToolExecutionsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListToolExecutionsCommand {
    pub command: ListToolExecutionsCommandCommand,
    pub request: ListToolExecutionsWire,
}
#[doc = "`ListToolExecutionsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-tool-executions\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListToolExecutionsCommandCommand {
    #[serde(rename = "list-tool-executions")]
    ListToolExecutions,
}
impl ::std::fmt::Display for ListToolExecutionsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListToolExecutions => f.write_str("list-tool-executions"),
        }
    }
}
impl ::std::str::FromStr for ListToolExecutionsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-tool-executions" => Ok(Self::ListToolExecutions),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListToolExecutionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListToolExecutionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListToolExecutionsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListToolExecutionsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableToolExecutionStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListToolExecutionsWire {
    pub limit: NullableInteger,
    pub run_id: NullableString,
    pub session_id: NullableString,
    pub state: NullableToolExecutionStateWire,
}
#[doc = "`ListWorkspaceChangeOperationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-workspace-change-operations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeOperationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeOperationsCommand {
    pub command: ListWorkspaceChangeOperationsCommandCommand,
    pub request: ListWorkspaceChangeOperationsWire,
}
#[doc = "`ListWorkspaceChangeOperationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-workspace-change-operations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListWorkspaceChangeOperationsCommandCommand {
    #[serde(rename = "list-workspace-change-operations")]
    ListWorkspaceChangeOperations,
}
impl ::std::fmt::Display for ListWorkspaceChangeOperationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListWorkspaceChangeOperations => f.write_str("list-workspace-change-operations"),
        }
    }
}
impl ::std::str::FromStr for ListWorkspaceChangeOperationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-workspace-change-operations" => Ok(Self::ListWorkspaceChangeOperations),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListWorkspaceChangeOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for ListWorkspaceChangeOperationsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ListWorkspaceChangeOperationsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListWorkspaceChangeOperationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"changeset_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"changeset_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeOperationsWire {
    pub changeset_id: ::std::string::String,
}
#[doc = "`ListWorkspaceChangeProposalOperationsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-workspace-change-proposal-operations\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeProposalOperationsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeProposalOperationsCommand {
    pub command: ListWorkspaceChangeProposalOperationsCommandCommand,
    pub request: ListWorkspaceChangeProposalOperationsWire,
}
#[doc = "`ListWorkspaceChangeProposalOperationsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-workspace-change-proposal-operations\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListWorkspaceChangeProposalOperationsCommandCommand {
    #[serde(rename = "list-workspace-change-proposal-operations")]
    ListWorkspaceChangeProposalOperations,
}
impl ::std::fmt::Display for ListWorkspaceChangeProposalOperationsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListWorkspaceChangeProposalOperations => {
                f.write_str("list-workspace-change-proposal-operations")
            }
        }
    }
}
impl ::std::str::FromStr for ListWorkspaceChangeProposalOperationsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-workspace-change-proposal-operations" => {
                Ok(Self::ListWorkspaceChangeProposalOperations)
            }
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListWorkspaceChangeProposalOperationsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for ListWorkspaceChangeProposalOperationsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for ListWorkspaceChangeProposalOperationsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListWorkspaceChangeProposalOperationsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"proposal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeProposalOperationsWire {
    pub proposal_id: ::std::string::String,
}
#[doc = "`ListWorkspaceChangeProposalsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-workspace-change-proposals\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeProposalsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeProposalsCommand {
    pub command: ListWorkspaceChangeProposalsCommandCommand,
    pub request: ListWorkspaceChangeProposalsWire,
}
#[doc = "`ListWorkspaceChangeProposalsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-workspace-change-proposals\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListWorkspaceChangeProposalsCommandCommand {
    #[serde(rename = "list-workspace-change-proposals")]
    ListWorkspaceChangeProposals,
}
impl ::std::fmt::Display for ListWorkspaceChangeProposalsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListWorkspaceChangeProposals => f.write_str("list-workspace-change-proposals"),
        }
    }
}
impl ::std::str::FromStr for ListWorkspaceChangeProposalsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-workspace-change-proposals" => Ok(Self::ListWorkspaceChangeProposals),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListWorkspaceChangeProposalsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for ListWorkspaceChangeProposalsCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListWorkspaceChangeProposalsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListWorkspaceChangeProposalsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"changeset_id\","]
#[doc = "    \"limit\","]
#[doc = "    \"state\","]
#[doc = "    \"workspace_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"changeset_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableWorkspaceChangeProposalStateWire\""]
#[doc = "    },"]
#[doc = "    \"workspace_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeProposalsWire {
    pub changeset_id: NullableString,
    pub limit: NullableInteger,
    pub state: NullableWorkspaceChangeProposalStateWire,
    pub workspace_id: NullableString,
}
#[doc = "`ListWorkspaceChangeSetsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"list-workspace-change-sets\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeSetsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeSetsCommand {
    pub command: ListWorkspaceChangeSetsCommandCommand,
    pub request: ListWorkspaceChangeSetsWire,
}
#[doc = "`ListWorkspaceChangeSetsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"list-workspace-change-sets\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ListWorkspaceChangeSetsCommandCommand {
    #[serde(rename = "list-workspace-change-sets")]
    ListWorkspaceChangeSets,
}
impl ::std::fmt::Display for ListWorkspaceChangeSetsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ListWorkspaceChangeSets => f.write_str("list-workspace-change-sets"),
        }
    }
}
impl ::std::str::FromStr for ListWorkspaceChangeSetsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "list-workspace-change-sets" => Ok(Self::ListWorkspaceChangeSets),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ListWorkspaceChangeSetsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ListWorkspaceChangeSetsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ListWorkspaceChangeSetsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ListWorkspaceChangeSetsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"limit\","]
#[doc = "    \"state\","]
#[doc = "    \"workspace_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableWorkspaceChangeSetStateWire\""]
#[doc = "    },"]
#[doc = "    \"workspace_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ListWorkspaceChangeSetsWire {
    pub limit: NullableInteger,
    pub state: NullableWorkspaceChangeSetStateWire,
    pub workspace_id: NullableString,
}
#[doc = "`MaterializeReadyDelegationGraphNodeCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"materialize-ready-delegation-graph-node\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/MaterializeReadyDelegationGraphNodeWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializeReadyDelegationGraphNodeCommand {
    pub command: MaterializeReadyDelegationGraphNodeCommandCommand,
    pub request: MaterializeReadyDelegationGraphNodeWire,
}
#[doc = "`MaterializeReadyDelegationGraphNodeCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"materialize-ready-delegation-graph-node\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum MaterializeReadyDelegationGraphNodeCommandCommand {
    #[serde(rename = "materialize-ready-delegation-graph-node")]
    MaterializeReadyDelegationGraphNode,
}
impl ::std::fmt::Display for MaterializeReadyDelegationGraphNodeCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::MaterializeReadyDelegationGraphNode => {
                f.write_str("materialize-ready-delegation-graph-node")
            }
        }
    }
}
impl ::std::str::FromStr for MaterializeReadyDelegationGraphNodeCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "materialize-ready-delegation-graph-node" => {
                Ok(Self::MaterializeReadyDelegationGraphNode)
            }
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for MaterializeReadyDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for MaterializeReadyDelegationGraphNodeCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for MaterializeReadyDelegationGraphNodeCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`MaterializeReadyDelegationGraphNodeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"budget_grant_id\","]
#[doc = "    \"graph_id\","]
#[doc = "    \"job_id\","]
#[doc = "    \"job_idempotency_key\","]
#[doc = "    \"job_kind\","]
#[doc = "    \"job_payload\","]
#[doc = "    \"max_attempts\","]
#[doc = "    \"node_id\","]
#[doc = "    \"not_before\","]
#[doc = "    \"priority\","]
#[doc = "    \"retry_policy\","]
#[doc = "    \"scheduled_at\","]
#[doc = "    \"worker_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"budget_grant_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerJobKindWire\""]
#[doc = "    },"]
#[doc = "    \"job_payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"max_attempts\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"node_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"not_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"priority\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"retry_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"scheduled_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"worker_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct MaterializeReadyDelegationGraphNodeWire {
    pub budget_grant_id: NullableString,
    pub graph_id: ::std::string::String,
    pub job_id: NullableString,
    pub job_idempotency_key: NullableString,
    pub job_kind: SchedulerJobKindWire,
    pub job_payload: ::serde_json::Value,
    pub max_attempts: NullableInteger,
    pub node_id: NullableString,
    pub not_before: NullableInteger,
    pub priority: NullableInteger,
    pub retry_policy: NullableRetryPolicyWire,
    pub scheduled_at: NullableInteger,
    pub worker_id: ::std::string::String,
}
#[doc = "`MessagePartsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"array\","]
#[doc = "  \"items\": {"]
#[doc = "    \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct MessagePartsWire(pub ::std::vec::Vec<::serde_json::Value>);
impl ::std::ops::Deref for MessagePartsWire {
    type Target = ::std::vec::Vec<::serde_json::Value>;
    fn deref(&self) -> &::std::vec::Vec<::serde_json::Value> {
        &self.0
    }
}
impl ::std::convert::From<MessagePartsWire> for ::std::vec::Vec<::serde_json::Value> {
    fn from(value: MessagePartsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::vec::Vec<::serde_json::Value>> for MessagePartsWire {
    fn from(value: ::std::vec::Vec<::serde_json::Value>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableBoolean`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"type\": \"boolean\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableBoolean(pub ::std::option::Option<bool>);
impl ::std::ops::Deref for NullableBoolean {
    type Target = ::std::option::Option<bool>;
    fn deref(&self) -> &::std::option::Option<bool> {
        &self.0
    }
}
impl ::std::convert::From<NullableBoolean> for ::std::option::Option<bool> {
    fn from(value: NullableBoolean) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<bool>> for NullableBoolean {
    fn from(value: ::std::option::Option<bool>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableBudgetWindowKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetWindowKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableBudgetWindowKindWire(pub ::std::option::Option<BudgetWindowKindWire>);
impl ::std::ops::Deref for NullableBudgetWindowKindWire {
    type Target = ::std::option::Option<BudgetWindowKindWire>;
    fn deref(&self) -> &::std::option::Option<BudgetWindowKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableBudgetWindowKindWire>
    for ::std::option::Option<BudgetWindowKindWire>
{
    fn from(value: NullableBudgetWindowKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<BudgetWindowKindWire>>
    for NullableBudgetWindowKindWire
{
    fn from(value: ::std::option::Option<BudgetWindowKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableChannelBindingStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ChannelBindingStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableChannelBindingStateWire(pub ::std::option::Option<ChannelBindingStateWire>);
impl ::std::ops::Deref for NullableChannelBindingStateWire {
    type Target = ::std::option::Option<ChannelBindingStateWire>;
    fn deref(&self) -> &::std::option::Option<ChannelBindingStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableChannelBindingStateWire>
    for ::std::option::Option<ChannelBindingStateWire>
{
    fn from(value: NullableChannelBindingStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ChannelBindingStateWire>>
    for NullableChannelBindingStateWire
{
    fn from(value: ::std::option::Option<ChannelBindingStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableChannelInboundEventStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ChannelInboundEventStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableChannelInboundEventStateWire(
    pub ::std::option::Option<ChannelInboundEventStateWire>,
);
impl ::std::ops::Deref for NullableChannelInboundEventStateWire {
    type Target = ::std::option::Option<ChannelInboundEventStateWire>;
    fn deref(&self) -> &::std::option::Option<ChannelInboundEventStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableChannelInboundEventStateWire>
    for ::std::option::Option<ChannelInboundEventStateWire>
{
    fn from(value: NullableChannelInboundEventStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ChannelInboundEventStateWire>>
    for NullableChannelInboundEventStateWire
{
    fn from(value: ::std::option::Option<ChannelInboundEventStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableChannelProjectionTargetKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ChannelProjectionTargetKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableChannelProjectionTargetKindWire(
    pub ::std::option::Option<ChannelProjectionTargetKindWire>,
);
impl ::std::ops::Deref for NullableChannelProjectionTargetKindWire {
    type Target = ::std::option::Option<ChannelProjectionTargetKindWire>;
    fn deref(&self) -> &::std::option::Option<ChannelProjectionTargetKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableChannelProjectionTargetKindWire>
    for ::std::option::Option<ChannelProjectionTargetKindWire>
{
    fn from(value: NullableChannelProjectionTargetKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ChannelProjectionTargetKindWire>>
    for NullableChannelProjectionTargetKindWire
{
    fn from(value: ::std::option::Option<ChannelProjectionTargetKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableConnectorCredentialStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorCredentialStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableConnectorCredentialStateWire(
    pub ::std::option::Option<ConnectorCredentialStateWire>,
);
impl ::std::ops::Deref for NullableConnectorCredentialStateWire {
    type Target = ::std::option::Option<ConnectorCredentialStateWire>;
    fn deref(&self) -> &::std::option::Option<ConnectorCredentialStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableConnectorCredentialStateWire>
    for ::std::option::Option<ConnectorCredentialStateWire>
{
    fn from(value: NullableConnectorCredentialStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ConnectorCredentialStateWire>>
    for NullableConnectorCredentialStateWire
{
    fn from(value: ::std::option::Option<ConnectorCredentialStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableConnectorLiveSessionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorLiveSessionStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableConnectorLiveSessionStateWire(
    pub ::std::option::Option<ConnectorLiveSessionStateWire>,
);
impl ::std::ops::Deref for NullableConnectorLiveSessionStateWire {
    type Target = ::std::option::Option<ConnectorLiveSessionStateWire>;
    fn deref(&self) -> &::std::option::Option<ConnectorLiveSessionStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableConnectorLiveSessionStateWire>
    for ::std::option::Option<ConnectorLiveSessionStateWire>
{
    fn from(value: NullableConnectorLiveSessionStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ConnectorLiveSessionStateWire>>
    for NullableConnectorLiveSessionStateWire
{
    fn from(value: ::std::option::Option<ConnectorLiveSessionStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableConnectorRegistrationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorRegistrationStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableConnectorRegistrationStateWire(
    pub ::std::option::Option<ConnectorRegistrationStateWire>,
);
impl ::std::ops::Deref for NullableConnectorRegistrationStateWire {
    type Target = ::std::option::Option<ConnectorRegistrationStateWire>;
    fn deref(&self) -> &::std::option::Option<ConnectorRegistrationStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableConnectorRegistrationStateWire>
    for ::std::option::Option<ConnectorRegistrationStateWire>
{
    fn from(value: NullableConnectorRegistrationStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ConnectorRegistrationStateWire>>
    for NullableConnectorRegistrationStateWire
{
    fn from(value: ::std::option::Option<ConnectorRegistrationStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableConnectorSessionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorSessionStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableConnectorSessionStateWire(pub ::std::option::Option<ConnectorSessionStateWire>);
impl ::std::ops::Deref for NullableConnectorSessionStateWire {
    type Target = ::std::option::Option<ConnectorSessionStateWire>;
    fn deref(&self) -> &::std::option::Option<ConnectorSessionStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableConnectorSessionStateWire>
    for ::std::option::Option<ConnectorSessionStateWire>
{
    fn from(value: NullableConnectorSessionStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ConnectorSessionStateWire>>
    for NullableConnectorSessionStateWire
{
    fn from(value: ::std::option::Option<ConnectorSessionStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableContextEpochStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ContextEpochStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableContextEpochStateWire(pub ::std::option::Option<ContextEpochStateWire>);
impl ::std::ops::Deref for NullableContextEpochStateWire {
    type Target = ::std::option::Option<ContextEpochStateWire>;
    fn deref(&self) -> &::std::option::Option<ContextEpochStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableContextEpochStateWire>
    for ::std::option::Option<ContextEpochStateWire>
{
    fn from(value: NullableContextEpochStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ContextEpochStateWire>>
    for NullableContextEpochStateWire
{
    fn from(value: ::std::option::Option<ContextEpochStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableDelegationDependencyKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationDependencyKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableDelegationDependencyKindWire(
    pub ::std::option::Option<DelegationDependencyKindWire>,
);
impl ::std::ops::Deref for NullableDelegationDependencyKindWire {
    type Target = ::std::option::Option<DelegationDependencyKindWire>;
    fn deref(&self) -> &::std::option::Option<DelegationDependencyKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableDelegationDependencyKindWire>
    for ::std::option::Option<DelegationDependencyKindWire>
{
    fn from(value: NullableDelegationDependencyKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<DelegationDependencyKindWire>>
    for NullableDelegationDependencyKindWire
{
    fn from(value: ::std::option::Option<DelegationDependencyKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableDelegationGraphStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationGraphStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableDelegationGraphStateWire(pub ::std::option::Option<DelegationGraphStateWire>);
impl ::std::ops::Deref for NullableDelegationGraphStateWire {
    type Target = ::std::option::Option<DelegationGraphStateWire>;
    fn deref(&self) -> &::std::option::Option<DelegationGraphStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableDelegationGraphStateWire>
    for ::std::option::Option<DelegationGraphStateWire>
{
    fn from(value: NullableDelegationGraphStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<DelegationGraphStateWire>>
    for NullableDelegationGraphStateWire
{
    fn from(value: ::std::option::Option<DelegationGraphStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableDelegationNodeStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationNodeStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableDelegationNodeStateWire(pub ::std::option::Option<DelegationNodeStateWire>);
impl ::std::ops::Deref for NullableDelegationNodeStateWire {
    type Target = ::std::option::Option<DelegationNodeStateWire>;
    fn deref(&self) -> &::std::option::Option<DelegationNodeStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableDelegationNodeStateWire>
    for ::std::option::Option<DelegationNodeStateWire>
{
    fn from(value: NullableDelegationNodeStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<DelegationNodeStateWire>>
    for NullableDelegationNodeStateWire
{
    fn from(value: ::std::option::Option<DelegationNodeStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableInteger`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableInteger(pub ::std::option::Option<i64>);
impl ::std::ops::Deref for NullableInteger {
    type Target = ::std::option::Option<i64>;
    fn deref(&self) -> &::std::option::Option<i64> {
        &self.0
    }
}
impl ::std::convert::From<NullableInteger> for ::std::option::Option<i64> {
    fn from(value: NullableInteger) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<i64>> for NullableInteger {
    fn from(value: ::std::option::Option<i64>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableJsonObjectWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/JsonObjectWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableJsonObjectWire(pub ::std::option::Option<JsonObjectWire>);
impl ::std::ops::Deref for NullableJsonObjectWire {
    type Target = ::std::option::Option<JsonObjectWire>;
    fn deref(&self) -> &::std::option::Option<JsonObjectWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableJsonObjectWire> for ::std::option::Option<JsonObjectWire> {
    fn from(value: NullableJsonObjectWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<JsonObjectWire>> for NullableJsonObjectWire {
    fn from(value: ::std::option::Option<JsonObjectWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableMessagePartsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableMessagePartsWire(pub ::std::option::Option<MessagePartsWire>);
impl ::std::ops::Deref for NullableMessagePartsWire {
    type Target = ::std::option::Option<MessagePartsWire>;
    fn deref(&self) -> &::std::option::Option<MessagePartsWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableMessagePartsWire> for ::std::option::Option<MessagePartsWire> {
    fn from(value: NullableMessagePartsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<MessagePartsWire>> for NullableMessagePartsWire {
    fn from(value: ::std::option::Option<MessagePartsWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableObjectiveAttemptStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveAttemptStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableObjectiveAttemptStateWire(pub ::std::option::Option<ObjectiveAttemptStateWire>);
impl ::std::ops::Deref for NullableObjectiveAttemptStateWire {
    type Target = ::std::option::Option<ObjectiveAttemptStateWire>;
    fn deref(&self) -> &::std::option::Option<ObjectiveAttemptStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableObjectiveAttemptStateWire>
    for ::std::option::Option<ObjectiveAttemptStateWire>
{
    fn from(value: NullableObjectiveAttemptStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ObjectiveAttemptStateWire>>
    for NullableObjectiveAttemptStateWire
{
    fn from(value: ::std::option::Option<ObjectiveAttemptStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableObjectiveReferenceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveReferenceKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableObjectiveReferenceKindWire(
    pub ::std::option::Option<ObjectiveReferenceKindWire>,
);
impl ::std::ops::Deref for NullableObjectiveReferenceKindWire {
    type Target = ::std::option::Option<ObjectiveReferenceKindWire>;
    fn deref(&self) -> &::std::option::Option<ObjectiveReferenceKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableObjectiveReferenceKindWire>
    for ::std::option::Option<ObjectiveReferenceKindWire>
{
    fn from(value: NullableObjectiveReferenceKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ObjectiveReferenceKindWire>>
    for NullableObjectiveReferenceKindWire
{
    fn from(value: ::std::option::Option<ObjectiveReferenceKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableObjectiveRunStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveRunStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableObjectiveRunStateWire(pub ::std::option::Option<ObjectiveRunStateWire>);
impl ::std::ops::Deref for NullableObjectiveRunStateWire {
    type Target = ::std::option::Option<ObjectiveRunStateWire>;
    fn deref(&self) -> &::std::option::Option<ObjectiveRunStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableObjectiveRunStateWire>
    for ::std::option::Option<ObjectiveRunStateWire>
{
    fn from(value: NullableObjectiveRunStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ObjectiveRunStateWire>>
    for NullableObjectiveRunStateWire
{
    fn from(value: ::std::option::Option<ObjectiveRunStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableObjectiveVerificationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveVerificationStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableObjectiveVerificationStateWire(
    pub ::std::option::Option<ObjectiveVerificationStateWire>,
);
impl ::std::ops::Deref for NullableObjectiveVerificationStateWire {
    type Target = ::std::option::Option<ObjectiveVerificationStateWire>;
    fn deref(&self) -> &::std::option::Option<ObjectiveVerificationStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableObjectiveVerificationStateWire>
    for ::std::option::Option<ObjectiveVerificationStateWire>
{
    fn from(value: NullableObjectiveVerificationStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ObjectiveVerificationStateWire>>
    for NullableObjectiveVerificationStateWire
{
    fn from(value: ::std::option::Option<ObjectiveVerificationStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullablePlanProposalStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PlanProposalStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullablePlanProposalStateWire(pub ::std::option::Option<PlanProposalStateWire>);
impl ::std::ops::Deref for NullablePlanProposalStateWire {
    type Target = ::std::option::Option<PlanProposalStateWire>;
    fn deref(&self) -> &::std::option::Option<PlanProposalStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullablePlanProposalStateWire>
    for ::std::option::Option<PlanProposalStateWire>
{
    fn from(value: NullablePlanProposalStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<PlanProposalStateWire>>
    for NullablePlanProposalStateWire
{
    fn from(value: ::std::option::Option<PlanProposalStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullablePlanReferenceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PlanReferenceKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullablePlanReferenceKindWire(pub ::std::option::Option<PlanReferenceKindWire>);
impl ::std::ops::Deref for NullablePlanReferenceKindWire {
    type Target = ::std::option::Option<PlanReferenceKindWire>;
    fn deref(&self) -> &::std::option::Option<PlanReferenceKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullablePlanReferenceKindWire>
    for ::std::option::Option<PlanReferenceKindWire>
{
    fn from(value: NullablePlanReferenceKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<PlanReferenceKindWire>>
    for NullablePlanReferenceKindWire
{
    fn from(value: ::std::option::Option<PlanReferenceKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullablePluginCapabilityWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PluginCapabilityWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullablePluginCapabilityWire(pub ::std::option::Option<PluginCapabilityWire>);
impl ::std::ops::Deref for NullablePluginCapabilityWire {
    type Target = ::std::option::Option<PluginCapabilityWire>;
    fn deref(&self) -> &::std::option::Option<PluginCapabilityWire> {
        &self.0
    }
}
impl ::std::convert::From<NullablePluginCapabilityWire>
    for ::std::option::Option<PluginCapabilityWire>
{
    fn from(value: NullablePluginCapabilityWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<PluginCapabilityWire>>
    for NullablePluginCapabilityWire
{
    fn from(value: ::std::option::Option<PluginCapabilityWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullablePluginInstallStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PluginInstallStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullablePluginInstallStateWire(pub ::std::option::Option<PluginInstallStateWire>);
impl ::std::ops::Deref for NullablePluginInstallStateWire {
    type Target = ::std::option::Option<PluginInstallStateWire>;
    fn deref(&self) -> &::std::option::Option<PluginInstallStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullablePluginInstallStateWire>
    for ::std::option::Option<PluginInstallStateWire>
{
    fn from(value: NullablePluginInstallStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<PluginInstallStateWire>>
    for NullablePluginInstallStateWire
{
    fn from(value: ::std::option::Option<PluginInstallStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullablePluginManifestStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PluginManifestStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullablePluginManifestStateWire(pub ::std::option::Option<PluginManifestStateWire>);
impl ::std::ops::Deref for NullablePluginManifestStateWire {
    type Target = ::std::option::Option<PluginManifestStateWire>;
    fn deref(&self) -> &::std::option::Option<PluginManifestStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullablePluginManifestStateWire>
    for ::std::option::Option<PluginManifestStateWire>
{
    fn from(value: NullablePluginManifestStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<PluginManifestStateWire>>
    for NullablePluginManifestStateWire
{
    fn from(value: ::std::option::Option<PluginManifestStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableResourceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ResourceKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableResourceKindWire(pub ::std::option::Option<ResourceKindWire>);
impl ::std::ops::Deref for NullableResourceKindWire {
    type Target = ::std::option::Option<ResourceKindWire>;
    fn deref(&self) -> &::std::option::Option<ResourceKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableResourceKindWire> for ::std::option::Option<ResourceKindWire> {
    fn from(value: NullableResourceKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ResourceKindWire>> for NullableResourceKindWire {
    fn from(value: ::std::option::Option<ResourceKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableResourceOriginWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ResourceOriginWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableResourceOriginWire(pub ::std::option::Option<ResourceOriginWire>);
impl ::std::ops::Deref for NullableResourceOriginWire {
    type Target = ::std::option::Option<ResourceOriginWire>;
    fn deref(&self) -> &::std::option::Option<ResourceOriginWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableResourceOriginWire>
    for ::std::option::Option<ResourceOriginWire>
{
    fn from(value: NullableResourceOriginWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ResourceOriginWire>>
    for NullableResourceOriginWire
{
    fn from(value: ::std::option::Option<ResourceOriginWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableResourceSourceWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ResourceSourceWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableResourceSourceWire(pub ::std::option::Option<ResourceSourceWire>);
impl ::std::ops::Deref for NullableResourceSourceWire {
    type Target = ::std::option::Option<ResourceSourceWire>;
    fn deref(&self) -> &::std::option::Option<ResourceSourceWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableResourceSourceWire>
    for ::std::option::Option<ResourceSourceWire>
{
    fn from(value: NullableResourceSourceWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ResourceSourceWire>>
    for NullableResourceSourceWire
{
    fn from(value: ::std::option::Option<ResourceSourceWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableResourceStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ResourceStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableResourceStateWire(pub ::std::option::Option<ResourceStateWire>);
impl ::std::ops::Deref for NullableResourceStateWire {
    type Target = ::std::option::Option<ResourceStateWire>;
    fn deref(&self) -> &::std::option::Option<ResourceStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableResourceStateWire> for ::std::option::Option<ResourceStateWire> {
    fn from(value: NullableResourceStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ResourceStateWire>> for NullableResourceStateWire {
    fn from(value: ::std::option::Option<ResourceStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableRetryPolicyWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableRetryPolicyWire(pub ::std::option::Option<RetryPolicyWire>);
impl ::std::ops::Deref for NullableRetryPolicyWire {
    type Target = ::std::option::Option<RetryPolicyWire>;
    fn deref(&self) -> &::std::option::Option<RetryPolicyWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableRetryPolicyWire> for ::std::option::Option<RetryPolicyWire> {
    fn from(value: NullableRetryPolicyWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<RetryPolicyWire>> for NullableRetryPolicyWire {
    fn from(value: ::std::option::Option<RetryPolicyWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableRunControlPolicyWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RunControlPolicyWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableRunControlPolicyWire(pub ::std::option::Option<RunControlPolicyWire>);
impl ::std::ops::Deref for NullableRunControlPolicyWire {
    type Target = ::std::option::Option<RunControlPolicyWire>;
    fn deref(&self) -> &::std::option::Option<RunControlPolicyWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableRunControlPolicyWire>
    for ::std::option::Option<RunControlPolicyWire>
{
    fn from(value: NullableRunControlPolicyWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<RunControlPolicyWire>>
    for NullableRunControlPolicyWire
{
    fn from(value: ::std::option::Option<RunControlPolicyWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSchedulerJobKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerJobKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSchedulerJobKindWire(pub ::std::option::Option<SchedulerJobKindWire>);
impl ::std::ops::Deref for NullableSchedulerJobKindWire {
    type Target = ::std::option::Option<SchedulerJobKindWire>;
    fn deref(&self) -> &::std::option::Option<SchedulerJobKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSchedulerJobKindWire>
    for ::std::option::Option<SchedulerJobKindWire>
{
    fn from(value: NullableSchedulerJobKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SchedulerJobKindWire>>
    for NullableSchedulerJobKindWire
{
    fn from(value: ::std::option::Option<SchedulerJobKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSchedulerJobKindsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerJobKindsWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSchedulerJobKindsWire(pub ::std::option::Option<SchedulerJobKindsWire>);
impl ::std::ops::Deref for NullableSchedulerJobKindsWire {
    type Target = ::std::option::Option<SchedulerJobKindsWire>;
    fn deref(&self) -> &::std::option::Option<SchedulerJobKindsWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSchedulerJobKindsWire>
    for ::std::option::Option<SchedulerJobKindsWire>
{
    fn from(value: NullableSchedulerJobKindsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SchedulerJobKindsWire>>
    for NullableSchedulerJobKindsWire
{
    fn from(value: ::std::option::Option<SchedulerJobKindsWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSchedulerJobStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerJobStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSchedulerJobStateWire(pub ::std::option::Option<SchedulerJobStateWire>);
impl ::std::ops::Deref for NullableSchedulerJobStateWire {
    type Target = ::std::option::Option<SchedulerJobStateWire>;
    fn deref(&self) -> &::std::option::Option<SchedulerJobStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSchedulerJobStateWire>
    for ::std::option::Option<SchedulerJobStateWire>
{
    fn from(value: NullableSchedulerJobStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SchedulerJobStateWire>>
    for NullableSchedulerJobStateWire
{
    fn from(value: ::std::option::Option<SchedulerJobStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionInputIntentWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionInputIntentWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionInputIntentWire(pub ::std::option::Option<SessionInputIntentWire>);
impl ::std::ops::Deref for NullableSessionInputIntentWire {
    type Target = ::std::option::Option<SessionInputIntentWire>;
    fn deref(&self) -> &::std::option::Option<SessionInputIntentWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionInputIntentWire>
    for ::std::option::Option<SessionInputIntentWire>
{
    fn from(value: NullableSessionInputIntentWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionInputIntentWire>>
    for NullableSessionInputIntentWire
{
    fn from(value: ::std::option::Option<SessionInputIntentWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionInputOriginWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionInputOriginWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionInputOriginWire(pub ::std::option::Option<SessionInputOriginWire>);
impl ::std::ops::Deref for NullableSessionInputOriginWire {
    type Target = ::std::option::Option<SessionInputOriginWire>;
    fn deref(&self) -> &::std::option::Option<SessionInputOriginWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionInputOriginWire>
    for ::std::option::Option<SessionInputOriginWire>
{
    fn from(value: NullableSessionInputOriginWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionInputOriginWire>>
    for NullableSessionInputOriginWire
{
    fn from(value: ::std::option::Option<SessionInputOriginWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionKindWire(pub ::std::option::Option<SessionKindWire>);
impl ::std::ops::Deref for NullableSessionKindWire {
    type Target = ::std::option::Option<SessionKindWire>;
    fn deref(&self) -> &::std::option::Option<SessionKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionKindWire> for ::std::option::Option<SessionKindWire> {
    fn from(value: NullableSessionKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionKindWire>> for NullableSessionKindWire {
    fn from(value: ::std::option::Option<SessionKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionRunControlKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionRunControlKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionRunControlKindWire(pub ::std::option::Option<SessionRunControlKindWire>);
impl ::std::ops::Deref for NullableSessionRunControlKindWire {
    type Target = ::std::option::Option<SessionRunControlKindWire>;
    fn deref(&self) -> &::std::option::Option<SessionRunControlKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionRunControlKindWire>
    for ::std::option::Option<SessionRunControlKindWire>
{
    fn from(value: NullableSessionRunControlKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionRunControlKindWire>>
    for NullableSessionRunControlKindWire
{
    fn from(value: ::std::option::Option<SessionRunControlKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionRunControlStatusWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionRunControlStatusWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionRunControlStatusWire(
    pub ::std::option::Option<SessionRunControlStatusWire>,
);
impl ::std::ops::Deref for NullableSessionRunControlStatusWire {
    type Target = ::std::option::Option<SessionRunControlStatusWire>;
    fn deref(&self) -> &::std::option::Option<SessionRunControlStatusWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionRunControlStatusWire>
    for ::std::option::Option<SessionRunControlStatusWire>
{
    fn from(value: NullableSessionRunControlStatusWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionRunControlStatusWire>>
    for NullableSessionRunControlStatusWire
{
    fn from(value: ::std::option::Option<SessionRunControlStatusWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionRunModeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionRunModeWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionRunModeWire(pub ::std::option::Option<SessionRunModeWire>);
impl ::std::ops::Deref for NullableSessionRunModeWire {
    type Target = ::std::option::Option<SessionRunModeWire>;
    fn deref(&self) -> &::std::option::Option<SessionRunModeWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionRunModeWire>
    for ::std::option::Option<SessionRunModeWire>
{
    fn from(value: NullableSessionRunModeWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionRunModeWire>>
    for NullableSessionRunModeWire
{
    fn from(value: ::std::option::Option<SessionRunModeWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableSessionStatusWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionStatusWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableSessionStatusWire(pub ::std::option::Option<SessionStatusWire>);
impl ::std::ops::Deref for NullableSessionStatusWire {
    type Target = ::std::option::Option<SessionStatusWire>;
    fn deref(&self) -> &::std::option::Option<SessionStatusWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableSessionStatusWire> for ::std::option::Option<SessionStatusWire> {
    fn from(value: NullableSessionStatusWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<SessionStatusWire>> for NullableSessionStatusWire {
    fn from(value: ::std::option::Option<SessionStatusWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableString`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableString(pub ::std::option::Option<::std::string::String>);
impl ::std::ops::Deref for NullableString {
    type Target = ::std::option::Option<::std::string::String>;
    fn deref(&self) -> &::std::option::Option<::std::string::String> {
        &self.0
    }
}
impl ::std::convert::From<NullableString> for ::std::option::Option<::std::string::String> {
    fn from(value: NullableString) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<::std::string::String>> for NullableString {
    fn from(value: ::std::option::Option<::std::string::String>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableTeamAudienceParticipantIdsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamAudienceParticipantIdsWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableTeamAudienceParticipantIdsWire(
    pub ::std::option::Option<TeamAudienceParticipantIdsWire>,
);
impl ::std::ops::Deref for NullableTeamAudienceParticipantIdsWire {
    type Target = ::std::option::Option<TeamAudienceParticipantIdsWire>;
    fn deref(&self) -> &::std::option::Option<TeamAudienceParticipantIdsWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableTeamAudienceParticipantIdsWire>
    for ::std::option::Option<TeamAudienceParticipantIdsWire>
{
    fn from(value: NullableTeamAudienceParticipantIdsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<TeamAudienceParticipantIdsWire>>
    for NullableTeamAudienceParticipantIdsWire
{
    fn from(value: ::std::option::Option<TeamAudienceParticipantIdsWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableTeamConversationModeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamConversationModeWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableTeamConversationModeWire(pub ::std::option::Option<TeamConversationModeWire>);
impl ::std::ops::Deref for NullableTeamConversationModeWire {
    type Target = ::std::option::Option<TeamConversationModeWire>;
    fn deref(&self) -> &::std::option::Option<TeamConversationModeWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableTeamConversationModeWire>
    for ::std::option::Option<TeamConversationModeWire>
{
    fn from(value: NullableTeamConversationModeWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<TeamConversationModeWire>>
    for NullableTeamConversationModeWire
{
    fn from(value: ::std::option::Option<TeamConversationModeWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableTeamConversationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamConversationStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableTeamConversationStateWire(pub ::std::option::Option<TeamConversationStateWire>);
impl ::std::ops::Deref for NullableTeamConversationStateWire {
    type Target = ::std::option::Option<TeamConversationStateWire>;
    fn deref(&self) -> &::std::option::Option<TeamConversationStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableTeamConversationStateWire>
    for ::std::option::Option<TeamConversationStateWire>
{
    fn from(value: NullableTeamConversationStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<TeamConversationStateWire>>
    for NullableTeamConversationStateWire
{
    fn from(value: ::std::option::Option<TeamConversationStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableTeamParticipantStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamParticipantStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableTeamParticipantStateWire(pub ::std::option::Option<TeamParticipantStateWire>);
impl ::std::ops::Deref for NullableTeamParticipantStateWire {
    type Target = ::std::option::Option<TeamParticipantStateWire>;
    fn deref(&self) -> &::std::option::Option<TeamParticipantStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableTeamParticipantStateWire>
    for ::std::option::Option<TeamParticipantStateWire>
{
    fn from(value: NullableTeamParticipantStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<TeamParticipantStateWire>>
    for NullableTeamParticipantStateWire
{
    fn from(value: ::std::option::Option<TeamParticipantStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableTeamTurnKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamTurnKindWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableTeamTurnKindWire(pub ::std::option::Option<TeamTurnKindWire>);
impl ::std::ops::Deref for NullableTeamTurnKindWire {
    type Target = ::std::option::Option<TeamTurnKindWire>;
    fn deref(&self) -> &::std::option::Option<TeamTurnKindWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableTeamTurnKindWire> for ::std::option::Option<TeamTurnKindWire> {
    fn from(value: NullableTeamTurnKindWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<TeamTurnKindWire>> for NullableTeamTurnKindWire {
    fn from(value: ::std::option::Option<TeamTurnKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableToolExecutionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ToolExecutionStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableToolExecutionStateWire(pub ::std::option::Option<ToolExecutionStateWire>);
impl ::std::ops::Deref for NullableToolExecutionStateWire {
    type Target = ::std::option::Option<ToolExecutionStateWire>;
    fn deref(&self) -> &::std::option::Option<ToolExecutionStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableToolExecutionStateWire>
    for ::std::option::Option<ToolExecutionStateWire>
{
    fn from(value: NullableToolExecutionStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<ToolExecutionStateWire>>
    for NullableToolExecutionStateWire
{
    fn from(value: ::std::option::Option<ToolExecutionStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableUnsigned32`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/Unsigned32\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableUnsigned32(pub ::std::option::Option<Unsigned32>);
impl ::std::ops::Deref for NullableUnsigned32 {
    type Target = ::std::option::Option<Unsigned32>;
    fn deref(&self) -> &::std::option::Option<Unsigned32> {
        &self.0
    }
}
impl ::std::convert::From<NullableUnsigned32> for ::std::option::Option<Unsigned32> {
    fn from(value: NullableUnsigned32) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<Unsigned32>> for NullableUnsigned32 {
    fn from(value: ::std::option::Option<Unsigned32>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableWorkspaceChangeProposalStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/WorkspaceChangeProposalStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableWorkspaceChangeProposalStateWire(
    pub ::std::option::Option<WorkspaceChangeProposalStateWire>,
);
impl ::std::ops::Deref for NullableWorkspaceChangeProposalStateWire {
    type Target = ::std::option::Option<WorkspaceChangeProposalStateWire>;
    fn deref(&self) -> &::std::option::Option<WorkspaceChangeProposalStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableWorkspaceChangeProposalStateWire>
    for ::std::option::Option<WorkspaceChangeProposalStateWire>
{
    fn from(value: NullableWorkspaceChangeProposalStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<WorkspaceChangeProposalStateWire>>
    for NullableWorkspaceChangeProposalStateWire
{
    fn from(value: ::std::option::Option<WorkspaceChangeProposalStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`NullableWorkspaceChangeSetStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/WorkspaceChangeSetStateWire\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"type\": \"null\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct NullableWorkspaceChangeSetStateWire(
    pub ::std::option::Option<WorkspaceChangeSetStateWire>,
);
impl ::std::ops::Deref for NullableWorkspaceChangeSetStateWire {
    type Target = ::std::option::Option<WorkspaceChangeSetStateWire>;
    fn deref(&self) -> &::std::option::Option<WorkspaceChangeSetStateWire> {
        &self.0
    }
}
impl ::std::convert::From<NullableWorkspaceChangeSetStateWire>
    for ::std::option::Option<WorkspaceChangeSetStateWire>
{
    fn from(value: NullableWorkspaceChangeSetStateWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::option::Option<WorkspaceChangeSetStateWire>>
    for NullableWorkspaceChangeSetStateWire
{
    fn from(value: ::std::option::Option<WorkspaceChangeSetStateWire>) -> Self {
        Self(value)
    }
}
#[doc = "`ObjectiveAttemptStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"planned\","]
#[doc = "    \"running\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"blocked\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveAttemptStateWire {
    #[serde(rename = "planned")]
    Planned,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "blocked")]
    Blocked,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for ObjectiveAttemptStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Planned => f.write_str("planned"),
            Self::Running => f.write_str("running"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Blocked => f.write_str("blocked"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveAttemptStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "planned" => Ok(Self::Planned),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "blocked" => Ok(Self::Blocked),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveAttemptStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveAttemptStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveAttemptStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ObjectiveReferenceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"session\","]
#[doc = "    \"session_input\","]
#[doc = "    \"session_run\","]
#[doc = "    \"scheduler_job\","]
#[doc = "    \"plan_proposal\","]
#[doc = "    \"workspace_change_proposal\","]
#[doc = "    \"delegation_graph\","]
#[doc = "    \"resource\","]
#[doc = "    \"context_epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveReferenceKindWire {
    #[serde(rename = "session")]
    Session,
    #[serde(rename = "session_input")]
    SessionInput,
    #[serde(rename = "session_run")]
    SessionRun,
    #[serde(rename = "scheduler_job")]
    SchedulerJob,
    #[serde(rename = "plan_proposal")]
    PlanProposal,
    #[serde(rename = "workspace_change_proposal")]
    WorkspaceChangeProposal,
    #[serde(rename = "delegation_graph")]
    DelegationGraph,
    #[serde(rename = "resource")]
    Resource,
    #[serde(rename = "context_epoch")]
    ContextEpoch,
}
impl ::std::fmt::Display for ObjectiveReferenceKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Session => f.write_str("session"),
            Self::SessionInput => f.write_str("session_input"),
            Self::SessionRun => f.write_str("session_run"),
            Self::SchedulerJob => f.write_str("scheduler_job"),
            Self::PlanProposal => f.write_str("plan_proposal"),
            Self::WorkspaceChangeProposal => f.write_str("workspace_change_proposal"),
            Self::DelegationGraph => f.write_str("delegation_graph"),
            Self::Resource => f.write_str("resource"),
            Self::ContextEpoch => f.write_str("context_epoch"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveReferenceKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "session" => Ok(Self::Session),
            "session_input" => Ok(Self::SessionInput),
            "session_run" => Ok(Self::SessionRun),
            "scheduler_job" => Ok(Self::SchedulerJob),
            "plan_proposal" => Ok(Self::PlanProposal),
            "workspace_change_proposal" => Ok(Self::WorkspaceChangeProposal),
            "delegation_graph" => Ok(Self::DelegationGraph),
            "resource" => Ok(Self::Resource),
            "context_epoch" => Ok(Self::ContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ObjectiveRunOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"start\","]
#[doc = "    \"record_blocked\","]
#[doc = "    \"mark_succeeded\","]
#[doc = "    \"mark_failed\","]
#[doc = "    \"cancel\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveRunOperationWire {
    #[serde(rename = "start")]
    Start,
    #[serde(rename = "record_blocked")]
    RecordBlocked,
    #[serde(rename = "mark_succeeded")]
    MarkSucceeded,
    #[serde(rename = "mark_failed")]
    MarkFailed,
    #[serde(rename = "cancel")]
    Cancel,
}
impl ::std::fmt::Display for ObjectiveRunOperationWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Start => f.write_str("start"),
            Self::RecordBlocked => f.write_str("record_blocked"),
            Self::MarkSucceeded => f.write_str("mark_succeeded"),
            Self::MarkFailed => f.write_str("mark_failed"),
            Self::Cancel => f.write_str("cancel"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveRunOperationWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "start" => Ok(Self::Start),
            "record_blocked" => Ok(Self::RecordBlocked),
            "mark_succeeded" => Ok(Self::MarkSucceeded),
            "mark_failed" => Ok(Self::MarkFailed),
            "cancel" => Ok(Self::Cancel),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveRunOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveRunOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveRunOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ObjectiveRunStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"open\","]
#[doc = "    \"running\","]
#[doc = "    \"blocked\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveRunStateWire {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "blocked")]
    Blocked,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for ObjectiveRunStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Open => f.write_str("open"),
            Self::Running => f.write_str("running"),
            Self::Blocked => f.write_str("blocked"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveRunStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "open" => Ok(Self::Open),
            "running" => Ok(Self::Running),
            "blocked" => Ok(Self::Blocked),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveRunStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveRunStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveRunStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ObjectiveStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetObjectiveRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveRunsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecordObjectiveRunOperationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveRunOperationsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveAttemptCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveAttemptsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveVerificationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListObjectiveVerificationsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum ObjectiveStorageRpcCommand {
    PutObjectiveRunCommand(PutObjectiveRunCommand),
    GetObjectiveRunCommand(GetObjectiveRunCommand),
    ListObjectiveRunsCommand(ListObjectiveRunsCommand),
    RecordObjectiveRunOperationCommand(RecordObjectiveRunOperationCommand),
    ListObjectiveRunOperationsCommand(ListObjectiveRunOperationsCommand),
    PutObjectiveAttemptCommand(PutObjectiveAttemptCommand),
    ListObjectiveAttemptsCommand(ListObjectiveAttemptsCommand),
    PutObjectiveVerificationCommand(PutObjectiveVerificationCommand),
    ListObjectiveVerificationsCommand(ListObjectiveVerificationsCommand),
}
impl ::std::convert::From<PutObjectiveRunCommand> for ObjectiveStorageRpcCommand {
    fn from(value: PutObjectiveRunCommand) -> Self {
        Self::PutObjectiveRunCommand(value)
    }
}
impl ::std::convert::From<GetObjectiveRunCommand> for ObjectiveStorageRpcCommand {
    fn from(value: GetObjectiveRunCommand) -> Self {
        Self::GetObjectiveRunCommand(value)
    }
}
impl ::std::convert::From<ListObjectiveRunsCommand> for ObjectiveStorageRpcCommand {
    fn from(value: ListObjectiveRunsCommand) -> Self {
        Self::ListObjectiveRunsCommand(value)
    }
}
impl ::std::convert::From<RecordObjectiveRunOperationCommand> for ObjectiveStorageRpcCommand {
    fn from(value: RecordObjectiveRunOperationCommand) -> Self {
        Self::RecordObjectiveRunOperationCommand(value)
    }
}
impl ::std::convert::From<ListObjectiveRunOperationsCommand> for ObjectiveStorageRpcCommand {
    fn from(value: ListObjectiveRunOperationsCommand) -> Self {
        Self::ListObjectiveRunOperationsCommand(value)
    }
}
impl ::std::convert::From<PutObjectiveAttemptCommand> for ObjectiveStorageRpcCommand {
    fn from(value: PutObjectiveAttemptCommand) -> Self {
        Self::PutObjectiveAttemptCommand(value)
    }
}
impl ::std::convert::From<ListObjectiveAttemptsCommand> for ObjectiveStorageRpcCommand {
    fn from(value: ListObjectiveAttemptsCommand) -> Self {
        Self::ListObjectiveAttemptsCommand(value)
    }
}
impl ::std::convert::From<PutObjectiveVerificationCommand> for ObjectiveStorageRpcCommand {
    fn from(value: PutObjectiveVerificationCommand) -> Self {
        Self::PutObjectiveVerificationCommand(value)
    }
}
impl ::std::convert::From<ListObjectiveVerificationsCommand> for ObjectiveStorageRpcCommand {
    fn from(value: ListObjectiveVerificationsCommand) -> Self {
        Self::ListObjectiveVerificationsCommand(value)
    }
}
#[doc = "`ObjectiveVerificationKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"script\","]
#[doc = "    \"model\","]
#[doc = "    \"human\","]
#[doc = "    \"runtime\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveVerificationKindWire {
    #[serde(rename = "script")]
    Script,
    #[serde(rename = "model")]
    Model,
    #[serde(rename = "human")]
    Human,
    #[serde(rename = "runtime")]
    Runtime,
}
impl ::std::fmt::Display for ObjectiveVerificationKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Script => f.write_str("script"),
            Self::Model => f.write_str("model"),
            Self::Human => f.write_str("human"),
            Self::Runtime => f.write_str("runtime"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveVerificationKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "script" => Ok(Self::Script),
            "model" => Ok(Self::Model),
            "human" => Ok(Self::Human),
            "runtime" => Ok(Self::Runtime),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveVerificationKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveVerificationKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveVerificationKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ObjectiveVerificationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"passed\","]
#[doc = "    \"failed\","]
#[doc = "    \"inconclusive\","]
#[doc = "    \"blocked\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ObjectiveVerificationStateWire {
    #[serde(rename = "passed")]
    Passed,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "inconclusive")]
    Inconclusive,
    #[serde(rename = "blocked")]
    Blocked,
}
impl ::std::fmt::Display for ObjectiveVerificationStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Passed => f.write_str("passed"),
            Self::Failed => f.write_str("failed"),
            Self::Inconclusive => f.write_str("inconclusive"),
            Self::Blocked => f.write_str("blocked"),
        }
    }
}
impl ::std::str::FromStr for ObjectiveVerificationStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "passed" => Ok(Self::Passed),
            "failed" => Ok(Self::Failed),
            "inconclusive" => Ok(Self::Inconclusive),
            "blocked" => Ok(Self::Blocked),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ObjectiveVerificationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ObjectiveVerificationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ObjectiveVerificationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PlanProposalOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"approve\","]
#[doc = "    \"reject\","]
#[doc = "    \"withdraw\","]
#[doc = "    \"request_execution\","]
#[doc = "    \"mark_executed\","]
#[doc = "    \"mark_execution_failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PlanProposalOperationWire {
    #[serde(rename = "approve")]
    Approve,
    #[serde(rename = "reject")]
    Reject,
    #[serde(rename = "withdraw")]
    Withdraw,
    #[serde(rename = "request_execution")]
    RequestExecution,
    #[serde(rename = "mark_executed")]
    MarkExecuted,
    #[serde(rename = "mark_execution_failed")]
    MarkExecutionFailed,
}
impl ::std::fmt::Display for PlanProposalOperationWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Approve => f.write_str("approve"),
            Self::Reject => f.write_str("reject"),
            Self::Withdraw => f.write_str("withdraw"),
            Self::RequestExecution => f.write_str("request_execution"),
            Self::MarkExecuted => f.write_str("mark_executed"),
            Self::MarkExecutionFailed => f.write_str("mark_execution_failed"),
        }
    }
}
impl ::std::str::FromStr for PlanProposalOperationWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "approve" => Ok(Self::Approve),
            "reject" => Ok(Self::Reject),
            "withdraw" => Ok(Self::Withdraw),
            "request_execution" => Ok(Self::RequestExecution),
            "mark_executed" => Ok(Self::MarkExecuted),
            "mark_execution_failed" => Ok(Self::MarkExecutionFailed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PlanProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PlanProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PlanProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PlanProposalStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"open\","]
#[doc = "    \"approved\","]
#[doc = "    \"rejected\","]
#[doc = "    \"withdrawn\","]
#[doc = "    \"execution_requested\","]
#[doc = "    \"executed\","]
#[doc = "    \"execution_failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PlanProposalStateWire {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "rejected")]
    Rejected,
    #[serde(rename = "withdrawn")]
    Withdrawn,
    #[serde(rename = "execution_requested")]
    ExecutionRequested,
    #[serde(rename = "executed")]
    Executed,
    #[serde(rename = "execution_failed")]
    ExecutionFailed,
}
impl ::std::fmt::Display for PlanProposalStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Open => f.write_str("open"),
            Self::Approved => f.write_str("approved"),
            Self::Rejected => f.write_str("rejected"),
            Self::Withdrawn => f.write_str("withdrawn"),
            Self::ExecutionRequested => f.write_str("execution_requested"),
            Self::Executed => f.write_str("executed"),
            Self::ExecutionFailed => f.write_str("execution_failed"),
        }
    }
}
impl ::std::str::FromStr for PlanProposalStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "open" => Ok(Self::Open),
            "approved" => Ok(Self::Approved),
            "rejected" => Ok(Self::Rejected),
            "withdrawn" => Ok(Self::Withdrawn),
            "execution_requested" => Ok(Self::ExecutionRequested),
            "executed" => Ok(Self::Executed),
            "execution_failed" => Ok(Self::ExecutionFailed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PlanProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PlanProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PlanProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PlanReferenceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"session\","]
#[doc = "    \"session_input\","]
#[doc = "    \"session_run\","]
#[doc = "    \"scheduler_job\","]
#[doc = "    \"workspace_change_proposal\","]
#[doc = "    \"delegation_graph\","]
#[doc = "    \"delegation_graph_node\","]
#[doc = "    \"team_conversation\","]
#[doc = "    \"resource\","]
#[doc = "    \"context_epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PlanReferenceKindWire {
    #[serde(rename = "session")]
    Session,
    #[serde(rename = "session_input")]
    SessionInput,
    #[serde(rename = "session_run")]
    SessionRun,
    #[serde(rename = "scheduler_job")]
    SchedulerJob,
    #[serde(rename = "workspace_change_proposal")]
    WorkspaceChangeProposal,
    #[serde(rename = "delegation_graph")]
    DelegationGraph,
    #[serde(rename = "delegation_graph_node")]
    DelegationGraphNode,
    #[serde(rename = "team_conversation")]
    TeamConversation,
    #[serde(rename = "resource")]
    Resource,
    #[serde(rename = "context_epoch")]
    ContextEpoch,
}
impl ::std::fmt::Display for PlanReferenceKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Session => f.write_str("session"),
            Self::SessionInput => f.write_str("session_input"),
            Self::SessionRun => f.write_str("session_run"),
            Self::SchedulerJob => f.write_str("scheduler_job"),
            Self::WorkspaceChangeProposal => f.write_str("workspace_change_proposal"),
            Self::DelegationGraph => f.write_str("delegation_graph"),
            Self::DelegationGraphNode => f.write_str("delegation_graph_node"),
            Self::TeamConversation => f.write_str("team_conversation"),
            Self::Resource => f.write_str("resource"),
            Self::ContextEpoch => f.write_str("context_epoch"),
        }
    }
}
impl ::std::str::FromStr for PlanReferenceKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "session" => Ok(Self::Session),
            "session_input" => Ok(Self::SessionInput),
            "session_run" => Ok(Self::SessionRun),
            "scheduler_job" => Ok(Self::SchedulerJob),
            "workspace_change_proposal" => Ok(Self::WorkspaceChangeProposal),
            "delegation_graph" => Ok(Self::DelegationGraph),
            "delegation_graph_node" => Ok(Self::DelegationGraphNode),
            "team_conversation" => Ok(Self::TeamConversation),
            "resource" => Ok(Self::Resource),
            "context_epoch" => Ok(Self::ContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PlanReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PlanReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PlanReferenceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PlanStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutPlanProposalCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetPlanProposalCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListPlanProposalsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecordPlanProposalOperationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListPlanProposalOperationsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum PlanStorageRpcCommand {
    PutPlanProposalCommand(PutPlanProposalCommand),
    GetPlanProposalCommand(GetPlanProposalCommand),
    ListPlanProposalsCommand(ListPlanProposalsCommand),
    RecordPlanProposalOperationCommand(RecordPlanProposalOperationCommand),
    ListPlanProposalOperationsCommand(ListPlanProposalOperationsCommand),
}
impl ::std::convert::From<PutPlanProposalCommand> for PlanStorageRpcCommand {
    fn from(value: PutPlanProposalCommand) -> Self {
        Self::PutPlanProposalCommand(value)
    }
}
impl ::std::convert::From<GetPlanProposalCommand> for PlanStorageRpcCommand {
    fn from(value: GetPlanProposalCommand) -> Self {
        Self::GetPlanProposalCommand(value)
    }
}
impl ::std::convert::From<ListPlanProposalsCommand> for PlanStorageRpcCommand {
    fn from(value: ListPlanProposalsCommand) -> Self {
        Self::ListPlanProposalsCommand(value)
    }
}
impl ::std::convert::From<RecordPlanProposalOperationCommand> for PlanStorageRpcCommand {
    fn from(value: RecordPlanProposalOperationCommand) -> Self {
        Self::RecordPlanProposalOperationCommand(value)
    }
}
impl ::std::convert::From<ListPlanProposalOperationsCommand> for PlanStorageRpcCommand {
    fn from(value: ListPlanProposalOperationsCommand) -> Self {
        Self::ListPlanProposalOperationsCommand(value)
    }
}
#[doc = "`PluginCapabilitiesWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"array\","]
#[doc = "  \"items\": {"]
#[doc = "    \"$ref\": \"#/$defs/PluginCapabilityWire\""]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct PluginCapabilitiesWire(pub ::std::vec::Vec<PluginCapabilityWire>);
impl ::std::ops::Deref for PluginCapabilitiesWire {
    type Target = ::std::vec::Vec<PluginCapabilityWire>;
    fn deref(&self) -> &::std::vec::Vec<PluginCapabilityWire> {
        &self.0
    }
}
impl ::std::convert::From<PluginCapabilitiesWire> for ::std::vec::Vec<PluginCapabilityWire> {
    fn from(value: PluginCapabilitiesWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::vec::Vec<PluginCapabilityWire>> for PluginCapabilitiesWire {
    fn from(value: ::std::vec::Vec<PluginCapabilityWire>) -> Self {
        Self(value)
    }
}
#[doc = "`PluginCapabilityWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"resource.read\","]
#[doc = "    \"resource.write\","]
#[doc = "    \"workspace.change.propose\","]
#[doc = "    \"delegation.graph.read\","]
#[doc = "    \"delegation.graph.write\","]
#[doc = "    \"team.conversation.read\","]
#[doc = "    \"team.conversation.write\","]
#[doc = "    \"channel.connect\","]
#[doc = "    \"channel.receive\","]
#[doc = "    \"channel.deliver\","]
#[doc = "    \"config.read\","]
#[doc = "    \"config.write\","]
#[doc = "    \"network.fetch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PluginCapabilityWire {
    #[serde(rename = "resource.read")]
    ResourceRead,
    #[serde(rename = "resource.write")]
    ResourceWrite,
    #[serde(rename = "workspace.change.propose")]
    WorkspaceChangePropose,
    #[serde(rename = "delegation.graph.read")]
    DelegationGraphRead,
    #[serde(rename = "delegation.graph.write")]
    DelegationGraphWrite,
    #[serde(rename = "team.conversation.read")]
    TeamConversationRead,
    #[serde(rename = "team.conversation.write")]
    TeamConversationWrite,
    #[serde(rename = "channel.connect")]
    ChannelConnect,
    #[serde(rename = "channel.receive")]
    ChannelReceive,
    #[serde(rename = "channel.deliver")]
    ChannelDeliver,
    #[serde(rename = "config.read")]
    ConfigRead,
    #[serde(rename = "config.write")]
    ConfigWrite,
    #[serde(rename = "network.fetch")]
    NetworkFetch,
}
impl ::std::fmt::Display for PluginCapabilityWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ResourceRead => f.write_str("resource.read"),
            Self::ResourceWrite => f.write_str("resource.write"),
            Self::WorkspaceChangePropose => f.write_str("workspace.change.propose"),
            Self::DelegationGraphRead => f.write_str("delegation.graph.read"),
            Self::DelegationGraphWrite => f.write_str("delegation.graph.write"),
            Self::TeamConversationRead => f.write_str("team.conversation.read"),
            Self::TeamConversationWrite => f.write_str("team.conversation.write"),
            Self::ChannelConnect => f.write_str("channel.connect"),
            Self::ChannelReceive => f.write_str("channel.receive"),
            Self::ChannelDeliver => f.write_str("channel.deliver"),
            Self::ConfigRead => f.write_str("config.read"),
            Self::ConfigWrite => f.write_str("config.write"),
            Self::NetworkFetch => f.write_str("network.fetch"),
        }
    }
}
impl ::std::str::FromStr for PluginCapabilityWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "resource.read" => Ok(Self::ResourceRead),
            "resource.write" => Ok(Self::ResourceWrite),
            "workspace.change.propose" => Ok(Self::WorkspaceChangePropose),
            "delegation.graph.read" => Ok(Self::DelegationGraphRead),
            "delegation.graph.write" => Ok(Self::DelegationGraphWrite),
            "team.conversation.read" => Ok(Self::TeamConversationRead),
            "team.conversation.write" => Ok(Self::TeamConversationWrite),
            "channel.connect" => Ok(Self::ChannelConnect),
            "channel.receive" => Ok(Self::ChannelReceive),
            "channel.deliver" => Ok(Self::ChannelDeliver),
            "config.read" => Ok(Self::ConfigRead),
            "config.write" => Ok(Self::ConfigWrite),
            "network.fetch" => Ok(Self::NetworkFetch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PluginCapabilityWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PluginCapabilityWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PluginCapabilityWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PluginInstallStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"installed\","]
#[doc = "    \"disabled\","]
#[doc = "    \"removed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PluginInstallStateWire {
    #[serde(rename = "installed")]
    Installed,
    #[serde(rename = "disabled")]
    Disabled,
    #[serde(rename = "removed")]
    Removed,
}
impl ::std::fmt::Display for PluginInstallStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Installed => f.write_str("installed"),
            Self::Disabled => f.write_str("disabled"),
            Self::Removed => f.write_str("removed"),
        }
    }
}
impl ::std::str::FromStr for PluginInstallStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "installed" => Ok(Self::Installed),
            "disabled" => Ok(Self::Disabled),
            "removed" => Ok(Self::Removed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PluginInstallStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PluginInstallStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PluginInstallStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PluginManifestStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"registered\","]
#[doc = "    \"disabled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PluginManifestStateWire {
    #[serde(rename = "registered")]
    Registered,
    #[serde(rename = "disabled")]
    Disabled,
}
impl ::std::fmt::Display for PluginManifestStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Registered => f.write_str("registered"),
            Self::Disabled => f.write_str("disabled"),
        }
    }
}
impl ::std::str::FromStr for PluginManifestStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "registered" => Ok(Self::Registered),
            "disabled" => Ok(Self::Disabled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PluginManifestStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PluginManifestStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PluginManifestStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PluginStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutPluginManifestCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetPluginManifestCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListPluginManifestsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutPluginInstallCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetPluginInstallCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListPluginInstallsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdatePluginInstallStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdatePluginManifestStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitPluginActionCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum PluginStorageRpcCommand {
    PutPluginManifestCommand(PutPluginManifestCommand),
    GetPluginManifestCommand(GetPluginManifestCommand),
    ListPluginManifestsCommand(ListPluginManifestsCommand),
    PutPluginInstallCommand(PutPluginInstallCommand),
    GetPluginInstallCommand(GetPluginInstallCommand),
    ListPluginInstallsCommand(ListPluginInstallsCommand),
    UpdatePluginInstallStateCommand(UpdatePluginInstallStateCommand),
    UpdatePluginManifestStateCommand(UpdatePluginManifestStateCommand),
    SubmitPluginActionCommand(SubmitPluginActionCommand),
}
impl ::std::convert::From<PutPluginManifestCommand> for PluginStorageRpcCommand {
    fn from(value: PutPluginManifestCommand) -> Self {
        Self::PutPluginManifestCommand(value)
    }
}
impl ::std::convert::From<GetPluginManifestCommand> for PluginStorageRpcCommand {
    fn from(value: GetPluginManifestCommand) -> Self {
        Self::GetPluginManifestCommand(value)
    }
}
impl ::std::convert::From<ListPluginManifestsCommand> for PluginStorageRpcCommand {
    fn from(value: ListPluginManifestsCommand) -> Self {
        Self::ListPluginManifestsCommand(value)
    }
}
impl ::std::convert::From<PutPluginInstallCommand> for PluginStorageRpcCommand {
    fn from(value: PutPluginInstallCommand) -> Self {
        Self::PutPluginInstallCommand(value)
    }
}
impl ::std::convert::From<GetPluginInstallCommand> for PluginStorageRpcCommand {
    fn from(value: GetPluginInstallCommand) -> Self {
        Self::GetPluginInstallCommand(value)
    }
}
impl ::std::convert::From<ListPluginInstallsCommand> for PluginStorageRpcCommand {
    fn from(value: ListPluginInstallsCommand) -> Self {
        Self::ListPluginInstallsCommand(value)
    }
}
impl ::std::convert::From<UpdatePluginInstallStateCommand> for PluginStorageRpcCommand {
    fn from(value: UpdatePluginInstallStateCommand) -> Self {
        Self::UpdatePluginInstallStateCommand(value)
    }
}
impl ::std::convert::From<UpdatePluginManifestStateCommand> for PluginStorageRpcCommand {
    fn from(value: UpdatePluginManifestStateCommand) -> Self {
        Self::UpdatePluginManifestStateCommand(value)
    }
}
impl ::std::convert::From<SubmitPluginActionCommand> for PluginStorageRpcCommand {
    fn from(value: SubmitPluginActionCommand) -> Self {
        Self::SubmitPluginActionCommand(value)
    }
}
#[doc = "`ProjectChannelInboundEventCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"project-channel-inbound-event\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ProjectChannelInboundEventWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ProjectChannelInboundEventCommand {
    pub command: ProjectChannelInboundEventCommandCommand,
    pub request: ProjectChannelInboundEventWire,
}
#[doc = "`ProjectChannelInboundEventCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"project-channel-inbound-event\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ProjectChannelInboundEventCommandCommand {
    #[serde(rename = "project-channel-inbound-event")]
    ProjectChannelInboundEvent,
}
impl ::std::fmt::Display for ProjectChannelInboundEventCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ProjectChannelInboundEvent => f.write_str("project-channel-inbound-event"),
        }
    }
}
impl ::std::str::FromStr for ProjectChannelInboundEventCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "project-channel-inbound-event" => Ok(Self::ProjectChannelInboundEvent),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ProjectChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ProjectChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ProjectChannelInboundEventCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ProjectChannelInboundEventWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"inbound_event_id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"target\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"inbound_event_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"target\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ProjectChannelInboundEventWire {
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub inbound_event_id: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub target: ::serde_json::Value,
}
#[doc = "`PruneContextEpochsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"prune-context-epochs\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PruneContextEpochsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PruneContextEpochsCommand {
    pub command: PruneContextEpochsCommandCommand,
    pub request: PruneContextEpochsWire,
}
#[doc = "`PruneContextEpochsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"prune-context-epochs\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PruneContextEpochsCommandCommand {
    #[serde(rename = "prune-context-epochs")]
    PruneContextEpochs,
}
impl ::std::fmt::Display for PruneContextEpochsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PruneContextEpochs => f.write_str("prune-context-epochs"),
        }
    }
}
impl ::std::str::FromStr for PruneContextEpochsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "prune-context-epochs" => Ok(Self::PruneContextEpochs),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PruneContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PruneContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PruneContextEpochsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PruneContextEpochsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"dry_run\","]
#[doc = "    \"keep_last_superseded\","]
#[doc = "    \"older_than_updated_at\","]
#[doc = "    \"policy_version\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"dry_run\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableBoolean\""]
#[doc = "    },"]
#[doc = "    \"keep_last_superseded\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"older_than_updated_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PruneContextEpochsWire {
    pub dry_run: NullableBoolean,
    pub keep_last_superseded: NullableInteger,
    pub older_than_updated_at: NullableInteger,
    pub policy_version: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`PutChannelBindingCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-channel-binding\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutChannelBindingWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutChannelBindingCommand {
    pub command: PutChannelBindingCommandCommand,
    pub request: PutChannelBindingWire,
}
#[doc = "`PutChannelBindingCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-channel-binding\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutChannelBindingCommandCommand {
    #[serde(rename = "put-channel-binding")]
    PutChannelBinding,
}
impl ::std::fmt::Display for PutChannelBindingCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutChannelBinding => f.write_str("put-channel-binding"),
        }
    }
}
impl ::std::str::FromStr for PutChannelBindingCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-channel-binding" => Ok(Self::PutChannelBinding),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutChannelBindingWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"channel_id\","]
#[doc = "    \"channel_kind\","]
#[doc = "    \"connector_id\","]
#[doc = "    \"display_name\","]
#[doc = "    \"external_identity_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"principal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"channel_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"channel_kind\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"display_name\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"external_identity_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutChannelBindingWire {
    pub channel_id: ::std::string::String,
    pub channel_kind: ::std::string::String,
    pub connector_id: ::std::string::String,
    pub display_name: NullableString,
    pub external_identity_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub principal_id: ::std::string::String,
}
#[doc = "`PutConfigCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"key\","]
#[doc = "    \"value\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-config\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"value\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutConfigCommand {
    pub command: PutConfigCommandCommand,
    pub key: ::std::string::String,
    pub value: ::serde_json::Value,
}
#[doc = "`PutConfigCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-config\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutConfigCommandCommand {
    #[serde(rename = "put-config")]
    PutConfig,
}
impl ::std::fmt::Display for PutConfigCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutConfig => f.write_str("put-config"),
        }
    }
}
impl ::std::str::FromStr for PutConfigCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-config" => Ok(Self::PutConfig),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutConfigCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutConnectorCredentialCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-connector-credential\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutConnectorCredentialWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutConnectorCredentialCommand {
    pub command: PutConnectorCredentialCommandCommand,
    pub request: PutConnectorCredentialWire,
}
#[doc = "`PutConnectorCredentialCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-connector-credential\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutConnectorCredentialCommandCommand {
    #[serde(rename = "put-connector-credential")]
    PutConnectorCredential,
}
impl ::std::fmt::Display for PutConnectorCredentialCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutConnectorCredential => f.write_str("put-connector-credential"),
        }
    }
}
impl ::std::str::FromStr for PutConnectorCredentialCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-connector-credential" => Ok(Self::PutConnectorCredential),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutConnectorCredentialWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"kind\","]
#[doc = "    \"metadata\","]
#[doc = "    \"secret_ref\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"secret_ref\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutConnectorCredentialWire {
    pub connector_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub kind: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub secret_ref: ::std::string::String,
}
#[doc = "`PutConnectorRegistrationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-connector-registration\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutConnectorRegistrationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutConnectorRegistrationCommand {
    pub command: PutConnectorRegistrationCommandCommand,
    pub request: PutConnectorRegistrationWire,
}
#[doc = "`PutConnectorRegistrationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-connector-registration\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutConnectorRegistrationCommandCommand {
    #[serde(rename = "put-connector-registration")]
    PutConnectorRegistration,
}
impl ::std::fmt::Display for PutConnectorRegistrationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutConnectorRegistration => f.write_str("put-connector-registration"),
        }
    }
}
impl ::std::str::FromStr for PutConnectorRegistrationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-connector-registration" => Ok(Self::PutConnectorRegistration),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutConnectorRegistrationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutConnectorRegistrationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutConnectorRegistrationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutConnectorRegistrationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutConnectorRegistrationWire {
    pub connector_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub plugin_id: ::std::string::String,
    pub version: NullableString,
}
#[doc = "`PutContextEpochCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-context-epoch\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutContextEpochWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutContextEpochCommand {
    pub command: PutContextEpochCommandCommand,
    pub request: PutContextEpochWire,
}
#[doc = "`PutContextEpochCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-context-epoch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutContextEpochCommandCommand {
    #[serde(rename = "put-context-epoch")]
    PutContextEpoch,
}
impl ::std::fmt::Display for PutContextEpochCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutContextEpoch => f.write_str("put-context-epoch"),
        }
    }
}
impl ::std::str::FromStr for PutContextEpochCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-context-epoch" => Ok(Self::PutContextEpoch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutContextEpochCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutContextEpochWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"policy_version\","]
#[doc = "    \"replacement_count\","]
#[doc = "    \"session_id\","]
#[doc = "    \"state\","]
#[doc = "    \"token_estimate_after\","]
#[doc = "    \"token_estimate_before\","]
#[doc = "    \"token_savings\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"replacement_count\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableContextEpochStateWire\""]
#[doc = "    },"]
#[doc = "    \"token_estimate_after\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"token_estimate_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"token_savings\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutContextEpochWire {
    pub id: NullableString,
    pub metadata: ::serde_json::Value,
    pub policy_version: ::std::string::String,
    pub replacement_count: NullableInteger,
    pub session_id: ::std::string::String,
    pub state: NullableContextEpochStateWire,
    pub token_estimate_after: NullableInteger,
    pub token_estimate_before: NullableInteger,
    pub token_savings: NullableInteger,
}
#[doc = "`PutContextReplacementCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-context-replacement\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutContextReplacementWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutContextReplacementCommand {
    pub command: PutContextReplacementCommandCommand,
    pub request: PutContextReplacementWire,
}
#[doc = "`PutContextReplacementCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-context-replacement\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutContextReplacementCommandCommand {
    #[serde(rename = "put-context-replacement")]
    PutContextReplacement,
}
impl ::std::fmt::Display for PutContextReplacementCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutContextReplacement => f.write_str("put-context-replacement"),
        }
    }
}
impl ::std::str::FromStr for PutContextReplacementCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-context-replacement" => Ok(Self::PutContextReplacement),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutContextReplacementCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutContextReplacementCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutContextReplacementCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutContextReplacementWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"epoch_id\","]
#[doc = "    \"id\","]
#[doc = "    \"message_id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"original_token_estimate\","]
#[doc = "    \"part_id\","]
#[doc = "    \"policy_version\","]
#[doc = "    \"replacement\","]
#[doc = "    \"replacement_token_estimate\","]
#[doc = "    \"session_id\","]
#[doc = "    \"tier\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"epoch_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"message_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"original_token_estimate\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"part_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"policy_version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"replacement\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"replacement_token_estimate\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"tier\": {"]
#[doc = "      \"$ref\": \"#/$defs/ContextReplacementTierWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutContextReplacementWire {
    pub epoch_id: ::std::string::String,
    pub id: NullableString,
    pub message_id: NullableString,
    pub metadata: ::serde_json::Value,
    pub original_token_estimate: i64,
    pub part_id: ::std::string::String,
    pub policy_version: ::std::string::String,
    pub replacement: ::serde_json::Value,
    pub replacement_token_estimate: i64,
    pub session_id: ::std::string::String,
    pub tier: ContextReplacementTierWire,
}
#[doc = "`PutDelegationGraphCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-delegation-graph\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphCommand {
    pub command: PutDelegationGraphCommandCommand,
    pub request: PutDelegationGraphWire,
}
#[doc = "`PutDelegationGraphCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-delegation-graph\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutDelegationGraphCommandCommand {
    #[serde(rename = "put-delegation-graph")]
    PutDelegationGraph,
}
impl ::std::fmt::Display for PutDelegationGraphCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutDelegationGraph => f.write_str("put-delegation-graph"),
        }
    }
}
impl ::std::str::FromStr for PutDelegationGraphCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-delegation-graph" => Ok(Self::PutDelegationGraph),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutDelegationGraphCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutDelegationGraphDependencyCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-delegation-graph-dependency\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphDependencyWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphDependencyCommand {
    pub command: PutDelegationGraphDependencyCommandCommand,
    pub request: PutDelegationGraphDependencyWire,
}
#[doc = "`PutDelegationGraphDependencyCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-delegation-graph-dependency\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutDelegationGraphDependencyCommandCommand {
    #[serde(rename = "put-delegation-graph-dependency")]
    PutDelegationGraphDependency,
}
impl ::std::fmt::Display for PutDelegationGraphDependencyCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutDelegationGraphDependency => f.write_str("put-delegation-graph-dependency"),
        }
    }
}
impl ::std::str::FromStr for PutDelegationGraphDependencyCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-delegation-graph-dependency" => Ok(Self::PutDelegationGraphDependency),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutDelegationGraphDependencyCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for PutDelegationGraphDependencyCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutDelegationGraphDependencyCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutDelegationGraphDependencyWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"from_node_id\","]
#[doc = "    \"graph_id\","]
#[doc = "    \"id\","]
#[doc = "    \"kind\","]
#[doc = "    \"to_node_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"from_node_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableDelegationDependencyKindWire\""]
#[doc = "    },"]
#[doc = "    \"to_node_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphDependencyWire {
    pub from_node_id: ::std::string::String,
    pub graph_id: ::std::string::String,
    pub id: NullableString,
    pub kind: NullableDelegationDependencyKindWire,
    pub to_node_id: ::std::string::String,
}
#[doc = "`PutDelegationGraphNodeCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-delegation-graph-node\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutDelegationGraphNodeWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphNodeCommand {
    pub command: PutDelegationGraphNodeCommandCommand,
    pub request: PutDelegationGraphNodeWire,
}
#[doc = "`PutDelegationGraphNodeCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-delegation-graph-node\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutDelegationGraphNodeCommandCommand {
    #[serde(rename = "put-delegation-graph-node")]
    PutDelegationGraphNode,
}
impl ::std::fmt::Display for PutDelegationGraphNodeCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutDelegationGraphNode => f.write_str("put-delegation-graph-node"),
        }
    }
}
impl ::std::str::FromStr for PutDelegationGraphNodeCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-delegation-graph-node" => Ok(Self::PutDelegationGraphNode),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutDelegationGraphNodeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutDelegationGraphNodeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"graph_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"kind\","]
#[doc = "    \"metadata\","]
#[doc = "    \"payload\","]
#[doc = "    \"principal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationNodeKindWire\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphNodeWire {
    pub graph_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub kind: DelegationNodeKindWire,
    pub metadata: ::serde_json::Value,
    pub payload: ::serde_json::Value,
    pub principal_id: ::std::string::String,
}
#[doc = "`PutDelegationGraphWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"title\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutDelegationGraphWire {
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub title: NullableString,
}
#[doc = "`PutObjectiveAttemptCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-objective-attempt\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveAttemptWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveAttemptCommand {
    pub command: PutObjectiveAttemptCommandCommand,
    pub request: PutObjectiveAttemptWire,
}
#[doc = "`PutObjectiveAttemptCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-objective-attempt\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutObjectiveAttemptCommandCommand {
    #[serde(rename = "put-objective-attempt")]
    PutObjectiveAttempt,
}
impl ::std::fmt::Display for PutObjectiveAttemptCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutObjectiveAttempt => f.write_str("put-objective-attempt"),
        }
    }
}
impl ::std::str::FromStr for PutObjectiveAttemptCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-objective-attempt" => Ok(Self::PutObjectiveAttempt),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutObjectiveAttemptCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutObjectiveAttemptCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutObjectiveAttemptCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutObjectiveAttemptWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"attempt_number\","]
#[doc = "    \"delegation_graph_id\","]
#[doc = "    \"error\","]
#[doc = "    \"finished_at\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"plan_proposal_id\","]
#[doc = "    \"result\","]
#[doc = "    \"scheduler_job_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"session_input_id\","]
#[doc = "    \"session_run_id\","]
#[doc = "    \"started_at\","]
#[doc = "    \"state\","]
#[doc = "    \"summary\","]
#[doc = "    \"workspace_change_proposal_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"attempt_number\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"delegation_graph_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"finished_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"plan_proposal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"scheduler_job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_input_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_run_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"started_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableObjectiveAttemptStateWire\""]
#[doc = "    },"]
#[doc = "    \"summary\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"workspace_change_proposal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveAttemptWire {
    pub attempt_number: NullableInteger,
    pub delegation_graph_id: NullableString,
    pub error: ::serde_json::Value,
    pub finished_at: NullableInteger,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub objective_id: ::std::string::String,
    pub plan_proposal_id: NullableString,
    pub result: ::serde_json::Value,
    pub scheduler_job_id: NullableString,
    pub session_id: NullableString,
    pub session_input_id: NullableString,
    pub session_run_id: NullableString,
    pub started_at: NullableInteger,
    pub state: NullableObjectiveAttemptStateWire,
    pub summary: NullableString,
    pub workspace_change_proposal_id: NullableString,
}
#[doc = "`PutObjectiveRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-objective-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveRunWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveRunCommand {
    pub command: PutObjectiveRunCommandCommand,
    pub request: PutObjectiveRunWire,
}
#[doc = "`PutObjectiveRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-objective-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutObjectiveRunCommandCommand {
    #[serde(rename = "put-objective-run")]
    PutObjectiveRun,
}
impl ::std::fmt::Display for PutObjectiveRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutObjectiveRun => f.write_str("put-objective-run"),
        }
    }
}
impl ::std::str::FromStr for PutObjectiveRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-objective-run" => Ok(Self::PutObjectiveRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutObjectiveRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutObjectiveRunWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"constraints\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"objective\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"references\","]
#[doc = "    \"scope\","]
#[doc = "    \"stop_policy\","]
#[doc = "    \"success_criteria\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"constraints\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"objective\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"references\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"scope\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"stop_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"success_criteria\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveRunWire {
    pub constraints: ::serde_json::Value,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub objective: ::std::string::String,
    pub principal_id: ::std::string::String,
    pub references: ::serde_json::Value,
    pub scope: NullableString,
    pub stop_policy: ::serde_json::Value,
    pub success_criteria: ::serde_json::Value,
}
#[doc = "`PutObjectiveVerificationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-objective-verification\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutObjectiveVerificationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveVerificationCommand {
    pub command: PutObjectiveVerificationCommandCommand,
    pub request: PutObjectiveVerificationWire,
}
#[doc = "`PutObjectiveVerificationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-objective-verification\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutObjectiveVerificationCommandCommand {
    #[serde(rename = "put-objective-verification")]
    PutObjectiveVerification,
}
impl ::std::fmt::Display for PutObjectiveVerificationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutObjectiveVerification => f.write_str("put-objective-verification"),
        }
    }
}
impl ::std::str::FromStr for PutObjectiveVerificationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-objective-verification" => Ok(Self::PutObjectiveVerification),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutObjectiveVerificationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutObjectiveVerificationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutObjectiveVerificationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutObjectiveVerificationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"attempt_id\","]
#[doc = "    \"evidence\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"kind\","]
#[doc = "    \"metadata\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"reason\","]
#[doc = "    \"state\","]
#[doc = "    \"verifier_ref\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"attempt_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"evidence\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveVerificationKindWire\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveVerificationStateWire\""]
#[doc = "    },"]
#[doc = "    \"verifier_ref\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutObjectiveVerificationWire {
    pub attempt_id: NullableString,
    pub evidence: ::serde_json::Value,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub kind: ObjectiveVerificationKindWire,
    pub metadata: ::serde_json::Value,
    pub objective_id: ::std::string::String,
    pub reason: NullableString,
    pub state: ObjectiveVerificationStateWire,
    pub verifier_ref: NullableString,
}
#[doc = "`PutPlanProposalCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-plan-proposal\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutPlanProposalWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPlanProposalCommand {
    pub command: PutPlanProposalCommandCommand,
    pub request: PutPlanProposalWire,
}
#[doc = "`PutPlanProposalCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-plan-proposal\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutPlanProposalCommandCommand {
    #[serde(rename = "put-plan-proposal")]
    PutPlanProposal,
}
impl ::std::fmt::Display for PutPlanProposalCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutPlanProposal => f.write_str("put-plan-proposal"),
        }
    }
}
impl ::std::str::FromStr for PutPlanProposalCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-plan-proposal" => Ok(Self::PutPlanProposal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutPlanProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutPlanProposalWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"references\","]
#[doc = "    \"steps\","]
#[doc = "    \"summary\","]
#[doc = "    \"title\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"references\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"steps\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"summary\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPlanProposalWire {
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub references: ::serde_json::Value,
    pub steps: ::serde_json::Value,
    pub summary: NullableString,
    pub title: NullableString,
}
#[doc = "`PutPluginInstallCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-plugin-install\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutPluginInstallWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPluginInstallCommand {
    pub command: PutPluginInstallCommandCommand,
    pub request: PutPluginInstallWire,
}
#[doc = "`PutPluginInstallCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-plugin-install\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutPluginInstallCommandCommand {
    #[serde(rename = "put-plugin-install")]
    PutPluginInstall,
}
impl ::std::fmt::Display for PutPluginInstallCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutPluginInstall => f.write_str("put-plugin-install"),
        }
    }
}
impl ::std::str::FromStr for PutPluginInstallCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-plugin-install" => Ok(Self::PutPluginInstall),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutPluginInstallCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutPluginInstallWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"install_root_dir\","]
#[doc = "    \"layout\","]
#[doc = "    \"metadata\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"trust\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"install_root_dir\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"layout\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"trust\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPluginInstallWire {
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub install_root_dir: ::std::string::String,
    pub layout: ::serde_json::Value,
    pub metadata: ::serde_json::Value,
    pub plugin_id: ::std::string::String,
    pub trust: ::serde_json::Value,
    pub version: ::std::string::String,
}
#[doc = "`PutPluginManifestCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-plugin-manifest\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutPluginManifestWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPluginManifestCommand {
    pub command: PutPluginManifestCommandCommand,
    pub request: PutPluginManifestWire,
}
#[doc = "`PutPluginManifestCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-plugin-manifest\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutPluginManifestCommandCommand {
    #[serde(rename = "put-plugin-manifest")]
    PutPluginManifest,
}
impl ::std::fmt::Display for PutPluginManifestCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutPluginManifest => f.write_str("put-plugin-manifest"),
        }
    }
}
impl ::std::str::FromStr for PutPluginManifestCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-plugin-manifest" => Ok(Self::PutPluginManifest),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutPluginManifestCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutPluginManifestWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"capabilities\","]
#[doc = "    \"entry\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"name\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"capabilities\": {"]
#[doc = "      \"$ref\": \"#/$defs/PluginCapabilitiesWire\""]
#[doc = "    },"]
#[doc = "    \"entry\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"name\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutPluginManifestWire {
    pub capabilities: PluginCapabilitiesWire,
    pub entry: ::serde_json::Value,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub name: NullableString,
    pub plugin_id: ::std::string::String,
    pub version: ::std::string::String,
}
#[doc = "`PutTeamConversationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-team-conversation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutTeamConversationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutTeamConversationCommand {
    pub command: PutTeamConversationCommandCommand,
    pub request: PutTeamConversationWire,
}
#[doc = "`PutTeamConversationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-team-conversation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutTeamConversationCommandCommand {
    #[serde(rename = "put-team-conversation")]
    PutTeamConversation,
}
impl ::std::fmt::Display for PutTeamConversationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutTeamConversation => f.write_str("put-team-conversation"),
        }
    }
}
impl ::std::str::FromStr for PutTeamConversationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-team-conversation" => Ok(Self::PutTeamConversation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutTeamConversationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutTeamConversationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"mode\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"title\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"mode\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableTeamConversationModeWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutTeamConversationWire {
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub mode: NullableTeamConversationModeWire,
    pub principal_id: ::std::string::String,
    pub title: NullableString,
}
#[doc = "`PutTeamParticipantCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-team-participant\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutTeamParticipantWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutTeamParticipantCommand {
    pub command: PutTeamParticipantCommandCommand,
    pub request: PutTeamParticipantWire,
}
#[doc = "`PutTeamParticipantCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-team-participant\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutTeamParticipantCommandCommand {
    #[serde(rename = "put-team-participant")]
    PutTeamParticipant,
}
impl ::std::fmt::Display for PutTeamParticipantCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutTeamParticipant => f.write_str("put-team-participant"),
        }
    }
}
impl ::std::str::FromStr for PutTeamParticipantCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-team-participant" => Ok(Self::PutTeamParticipant),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutTeamParticipantCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutTeamParticipantCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutTeamParticipantCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutTeamParticipantWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"conversation_id\","]
#[doc = "    \"display_name\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"kind\","]
#[doc = "    \"metadata\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"role\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"display_name\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"kind\": {"]
#[doc = "      \"$ref\": \"#/$defs/TeamParticipantKindWire\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"role\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutTeamParticipantWire {
    pub conversation_id: ::std::string::String,
    pub display_name: NullableString,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub kind: TeamParticipantKindWire,
    pub metadata: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub role: NullableString,
}
#[doc = "`PutWorkspaceChangeProposalCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-workspace-change-proposal\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutWorkspaceChangeProposalWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutWorkspaceChangeProposalCommand {
    pub command: PutWorkspaceChangeProposalCommandCommand,
    pub request: PutWorkspaceChangeProposalWire,
}
#[doc = "`PutWorkspaceChangeProposalCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-workspace-change-proposal\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutWorkspaceChangeProposalCommandCommand {
    #[serde(rename = "put-workspace-change-proposal")]
    PutWorkspaceChangeProposal,
}
impl ::std::fmt::Display for PutWorkspaceChangeProposalCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutWorkspaceChangeProposal => f.write_str("put-workspace-change-proposal"),
        }
    }
}
impl ::std::str::FromStr for PutWorkspaceChangeProposalCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-workspace-change-proposal" => Ok(Self::PutWorkspaceChangeProposal),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutWorkspaceChangeProposalCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutWorkspaceChangeProposalWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"changeset_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"summary\","]
#[doc = "    \"title\","]
#[doc = "    \"workspace_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"changeset_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"summary\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"title\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"workspace_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutWorkspaceChangeProposalWire {
    pub changeset_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub metadata: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub summary: NullableString,
    pub title: NullableString,
    pub workspace_id: ::std::string::String,
}
#[doc = "`PutWorkspaceChangeSetCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"put-workspace-change-set\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/PutWorkspaceChangeSetWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutWorkspaceChangeSetCommand {
    pub command: PutWorkspaceChangeSetCommandCommand,
    pub request: PutWorkspaceChangeSetWire,
}
#[doc = "`PutWorkspaceChangeSetCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"put-workspace-change-set\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum PutWorkspaceChangeSetCommandCommand {
    #[serde(rename = "put-workspace-change-set")]
    PutWorkspaceChangeSet,
}
impl ::std::fmt::Display for PutWorkspaceChangeSetCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::PutWorkspaceChangeSet => f.write_str("put-workspace-change-set"),
        }
    }
}
impl ::std::str::FromStr for PutWorkspaceChangeSetCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "put-workspace-change-set" => Ok(Self::PutWorkspaceChangeSet),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for PutWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for PutWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for PutWorkspaceChangeSetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`PutWorkspaceChangeSetWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"changeset\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"workspace_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"changeset\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"workspace_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct PutWorkspaceChangeSetWire {
    pub changeset: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub workspace_id: ::std::string::String,
}
#[doc = "`QueryEventsCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"query\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"query-events\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"query\": {"]
#[doc = "      \"$ref\": \"#/$defs/QueryEventsWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct QueryEventsCommand {
    pub command: QueryEventsCommandCommand,
    pub query: QueryEventsWire,
}
#[doc = "`QueryEventsCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"query-events\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum QueryEventsCommandCommand {
    #[serde(rename = "query-events")]
    QueryEvents,
}
impl ::std::fmt::Display for QueryEventsCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::QueryEvents => f.write_str("query-events"),
        }
    }
}
impl ::std::str::FromStr for QueryEventsCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "query-events" => Ok(Self::QueryEvents),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for QueryEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for QueryEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for QueryEventsCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`QueryEventsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"after_event_id\","]
#[doc = "    \"after_occurred_at\","]
#[doc = "    \"limit\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"plan_proposal_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"after_event_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"after_occurred_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableUnsigned32\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"plan_proposal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct QueryEventsWire {
    pub after_event_id: NullableString,
    pub after_occurred_at: NullableInteger,
    pub limit: NullableUnsigned32,
    pub objective_id: NullableString,
    pub plan_proposal_id: NullableString,
    pub session_id: NullableString,
}
#[doc = "`RecordBudgetUsageCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"record-budget-usage\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecordBudgetUsageWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordBudgetUsageCommand {
    pub command: RecordBudgetUsageCommandCommand,
    pub request: RecordBudgetUsageWire,
}
#[doc = "`RecordBudgetUsageCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"record-budget-usage\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecordBudgetUsageCommandCommand {
    #[serde(rename = "record-budget-usage")]
    RecordBudgetUsage,
}
impl ::std::fmt::Display for RecordBudgetUsageCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecordBudgetUsage => f.write_str("record-budget-usage"),
        }
    }
}
impl ::std::str::FromStr for RecordBudgetUsageCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "record-budget-usage" => Ok(Self::RecordBudgetUsage),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecordBudgetUsageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RecordBudgetUsageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RecordBudgetUsageCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecordBudgetUsageWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"grant_id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"source\","]
#[doc = "    \"source_id\","]
#[doc = "    \"usage\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"grant_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"source\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"source_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"usage\": {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetAmountWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordBudgetUsageWire {
    pub grant_id: ::std::string::String,
    pub idempotency_key: ::std::string::String,
    pub source: ::std::string::String,
    pub source_id: ::std::string::String,
    pub usage: BudgetAmountWire,
}
#[doc = "`RecordObjectiveRunOperationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"record-objective-run-operation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecordObjectiveRunOperationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordObjectiveRunOperationCommand {
    pub command: RecordObjectiveRunOperationCommandCommand,
    pub request: RecordObjectiveRunOperationWire,
}
#[doc = "`RecordObjectiveRunOperationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"record-objective-run-operation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecordObjectiveRunOperationCommandCommand {
    #[serde(rename = "record-objective-run-operation")]
    RecordObjectiveRunOperation,
}
impl ::std::fmt::Display for RecordObjectiveRunOperationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecordObjectiveRunOperation => f.write_str("record-objective-run-operation"),
        }
    }
}
impl ::std::str::FromStr for RecordObjectiveRunOperationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "record-objective-run-operation" => Ok(Self::RecordObjectiveRunOperation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecordObjectiveRunOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RecordObjectiveRunOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RecordObjectiveRunOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecordObjectiveRunOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"actor_id\","]
#[doc = "    \"id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"operation\","]
#[doc = "    \"reason\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"actor_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"operation\": {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveRunOperationWire\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordObjectiveRunOperationWire {
    pub actor_id: ::std::string::String,
    pub id: NullableString,
    pub metadata: ::serde_json::Value,
    pub objective_id: ::std::string::String,
    pub operation: ObjectiveRunOperationWire,
    pub reason: NullableString,
}
#[doc = "`RecordPlanProposalOperationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"record-plan-proposal-operation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecordPlanProposalOperationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordPlanProposalOperationCommand {
    pub command: RecordPlanProposalOperationCommandCommand,
    pub request: RecordPlanProposalOperationWire,
}
#[doc = "`RecordPlanProposalOperationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"record-plan-proposal-operation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecordPlanProposalOperationCommandCommand {
    #[serde(rename = "record-plan-proposal-operation")]
    RecordPlanProposalOperation,
}
impl ::std::fmt::Display for RecordPlanProposalOperationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecordPlanProposalOperation => f.write_str("record-plan-proposal-operation"),
        }
    }
}
impl ::std::str::FromStr for RecordPlanProposalOperationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "record-plan-proposal-operation" => Ok(Self::RecordPlanProposalOperation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecordPlanProposalOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RecordPlanProposalOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RecordPlanProposalOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecordPlanProposalOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"actor_id\","]
#[doc = "    \"id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"operation\","]
#[doc = "    \"proposal_id\","]
#[doc = "    \"reason\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"actor_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"operation\": {"]
#[doc = "      \"$ref\": \"#/$defs/PlanProposalOperationWire\""]
#[doc = "    },"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordPlanProposalOperationWire {
    pub actor_id: ::std::string::String,
    pub id: NullableString,
    pub metadata: ::serde_json::Value,
    pub operation: PlanProposalOperationWire,
    pub proposal_id: ::std::string::String,
    pub reason: NullableString,
}
#[doc = "`RecordWorkspaceChangeOperationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"record-workspace-change-operation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecordWorkspaceChangeOperationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordWorkspaceChangeOperationCommand {
    pub command: RecordWorkspaceChangeOperationCommandCommand,
    pub request: RecordWorkspaceChangeOperationWire,
}
#[doc = "`RecordWorkspaceChangeOperationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"record-workspace-change-operation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecordWorkspaceChangeOperationCommandCommand {
    #[serde(rename = "record-workspace-change-operation")]
    RecordWorkspaceChangeOperation,
}
impl ::std::fmt::Display for RecordWorkspaceChangeOperationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecordWorkspaceChangeOperation => {
                f.write_str("record-workspace-change-operation")
            }
        }
    }
}
impl ::std::str::FromStr for RecordWorkspaceChangeOperationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "record-workspace-change-operation" => Ok(Self::RecordWorkspaceChangeOperation),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecordWorkspaceChangeOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for RecordWorkspaceChangeOperationCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for RecordWorkspaceChangeOperationCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecordWorkspaceChangeOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"changeset_id\","]
#[doc = "    \"id\","]
#[doc = "    \"operation\","]
#[doc = "    \"receipt\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"changeset_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"operation\": {"]
#[doc = "      \"$ref\": \"#/$defs/WorkspaceChangeOperationWire\""]
#[doc = "    },"]
#[doc = "    \"receipt\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordWorkspaceChangeOperationWire {
    pub changeset_id: ::std::string::String,
    pub id: NullableString,
    pub operation: WorkspaceChangeOperationWire,
    pub receipt: ::serde_json::Value,
}
#[doc = "`RecordWorkspaceChangeProposalOperationCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"record-workspace-change-proposal-operation\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecordWorkspaceChangeProposalOperationWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordWorkspaceChangeProposalOperationCommand {
    pub command: RecordWorkspaceChangeProposalOperationCommandCommand,
    pub request: RecordWorkspaceChangeProposalOperationWire,
}
#[doc = "`RecordWorkspaceChangeProposalOperationCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"record-workspace-change-proposal-operation\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecordWorkspaceChangeProposalOperationCommandCommand {
    #[serde(rename = "record-workspace-change-proposal-operation")]
    RecordWorkspaceChangeProposalOperation,
}
impl ::std::fmt::Display for RecordWorkspaceChangeProposalOperationCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecordWorkspaceChangeProposalOperation => {
                f.write_str("record-workspace-change-proposal-operation")
            }
        }
    }
}
impl ::std::str::FromStr for RecordWorkspaceChangeProposalOperationCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "record-workspace-change-proposal-operation" => {
                Ok(Self::RecordWorkspaceChangeProposalOperation)
            }
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecordWorkspaceChangeProposalOperationCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for RecordWorkspaceChangeProposalOperationCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for RecordWorkspaceChangeProposalOperationCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecordWorkspaceChangeProposalOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"actor_id\","]
#[doc = "    \"id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"operation\","]
#[doc = "    \"proposal_id\","]
#[doc = "    \"reason\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"actor_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"operation\": {"]
#[doc = "      \"$ref\": \"#/$defs/WorkspaceChangeProposalOperationWire\""]
#[doc = "    },"]
#[doc = "    \"proposal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecordWorkspaceChangeProposalOperationWire {
    pub actor_id: ::std::string::String,
    pub id: NullableString,
    pub metadata: ::serde_json::Value,
    pub operation: WorkspaceChangeProposalOperationWire,
    pub proposal_id: ::std::string::String,
    pub reason: NullableString,
}
#[doc = "`RecoverToolExecutionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"recover-tool-execution\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RecoverToolExecutionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecoverToolExecutionCommand {
    pub command: RecoverToolExecutionCommandCommand,
    pub request: RecoverToolExecutionWire,
}
#[doc = "`RecoverToolExecutionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"recover-tool-execution\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecoverToolExecutionCommandCommand {
    #[serde(rename = "recover-tool-execution")]
    RecoverToolExecution,
}
impl ::std::fmt::Display for RecoverToolExecutionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RecoverToolExecution => f.write_str("recover-tool-execution"),
        }
    }
}
impl ::std::str::FromStr for RecoverToolExecutionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "recover-tool-execution" => Ok(Self::RecoverToolExecution),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecoverToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RecoverToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RecoverToolExecutionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RecoverToolExecutionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"action\","]
#[doc = "    \"execution_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"action\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"retry\","]
#[doc = "        \"require_recovery\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"execution_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RecoverToolExecutionWire {
    pub action: RecoverToolExecutionWireAction,
    pub execution_id: ::std::string::String,
}
#[doc = "`RecoverToolExecutionWireAction`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"retry\","]
#[doc = "    \"require_recovery\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RecoverToolExecutionWireAction {
    #[serde(rename = "retry")]
    Retry,
    #[serde(rename = "require_recovery")]
    RequireRecovery,
}
impl ::std::fmt::Display for RecoverToolExecutionWireAction {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Retry => f.write_str("retry"),
            Self::RequireRecovery => f.write_str("require_recovery"),
        }
    }
}
impl ::std::str::FromStr for RecoverToolExecutionWireAction {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "retry" => Ok(Self::Retry),
            "require_recovery" => Ok(Self::RequireRecovery),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RecoverToolExecutionWireAction {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RecoverToolExecutionWireAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RecoverToolExecutionWireAction {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseBudgetCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"grant_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"release-budget\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"grant_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ReleaseBudgetCommand {
    pub command: ReleaseBudgetCommandCommand,
    pub grant_id: ::std::string::String,
}
#[doc = "`ReleaseBudgetCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"release-budget\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseBudgetCommandCommand {
    #[serde(rename = "release-budget")]
    ReleaseBudget,
}
impl ::std::fmt::Display for ReleaseBudgetCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ReleaseBudget => f.write_str("release-budget"),
        }
    }
}
impl ::std::str::FromStr for ReleaseBudgetCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "release-budget" => Ok(Self::ReleaseBudget),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ReleaseBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReleaseRunnerCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"lease_token\","]
#[doc = "    \"runner_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"release-runner\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"lease_token\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"runner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ReleaseRunnerCommand {
    pub command: ReleaseRunnerCommandCommand,
    pub lease_token: ::std::string::String,
    pub runner_id: ::std::string::String,
    pub session_id: ::std::string::String,
}
#[doc = "`ReleaseRunnerCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"release-runner\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReleaseRunnerCommandCommand {
    #[serde(rename = "release-runner")]
    ReleaseRunner,
}
impl ::std::fmt::Display for ReleaseRunnerCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ReleaseRunner => f.write_str("release-runner"),
        }
    }
}
impl ::std::str::FromStr for ReleaseRunnerCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "release-runner" => Ok(Self::ReleaseRunner),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReleaseRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ReleaseRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReleaseRunnerCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReserveBudgetCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"reserve-budget\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/ReserveBudgetWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ReserveBudgetCommand {
    pub command: ReserveBudgetCommandCommand,
    pub request: ReserveBudgetWire,
}
#[doc = "`ReserveBudgetCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"reserve-budget\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ReserveBudgetCommandCommand {
    #[serde(rename = "reserve-budget")]
    ReserveBudget,
}
impl ::std::fmt::Display for ReserveBudgetCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::ReserveBudget => f.write_str("reserve-budget"),
        }
    }
}
impl ::std::str::FromStr for ReserveBudgetCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "reserve-budget" => Ok(Self::ReserveBudget),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ReserveBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ReserveBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ReserveBudgetCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ReserveBudgetWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"expires_at\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"limit\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"reason\","]
#[doc = "    \"requested\","]
#[doc = "    \"scope\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"expires_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"limit\": {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetAmountWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"reason\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"requested\": {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetAmountWire\""]
#[doc = "    },"]
#[doc = "    \"scope\": {"]
#[doc = "      \"$ref\": \"#/$defs/BudgetScopeRefWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ReserveBudgetWire {
    pub expires_at: NullableInteger,
    pub idempotency_key: ::std::string::String,
    pub limit: BudgetAmountWire,
    pub principal_id: ::std::string::String,
    pub reason: ::std::string::String,
    pub requested: BudgetAmountWire,
    pub scope: BudgetScopeRefWire,
}
#[doc = "`ResourceKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"file\","]
#[doc = "    \"image\","]
#[doc = "    \"video\","]
#[doc = "    \"audio\","]
#[doc = "    \"document\","]
#[doc = "    \"artifact\","]
#[doc = "    \"log\","]
#[doc = "    \"patch\","]
#[doc = "    \"url\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ResourceKindWire {
    #[serde(rename = "file")]
    File,
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "video")]
    Video,
    #[serde(rename = "audio")]
    Audio,
    #[serde(rename = "document")]
    Document,
    #[serde(rename = "artifact")]
    Artifact,
    #[serde(rename = "log")]
    Log,
    #[serde(rename = "patch")]
    Patch,
    #[serde(rename = "url")]
    Url,
}
impl ::std::fmt::Display for ResourceKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::File => f.write_str("file"),
            Self::Image => f.write_str("image"),
            Self::Video => f.write_str("video"),
            Self::Audio => f.write_str("audio"),
            Self::Document => f.write_str("document"),
            Self::Artifact => f.write_str("artifact"),
            Self::Log => f.write_str("log"),
            Self::Patch => f.write_str("patch"),
            Self::Url => f.write_str("url"),
        }
    }
}
impl ::std::str::FromStr for ResourceKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "file" => Ok(Self::File),
            "image" => Ok(Self::Image),
            "video" => Ok(Self::Video),
            "audio" => Ok(Self::Audio),
            "document" => Ok(Self::Document),
            "artifact" => Ok(Self::Artifact),
            "log" => Ok(Self::Log),
            "patch" => Ok(Self::Patch),
            "url" => Ok(Self::Url),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ResourceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ResourceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ResourceKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ResourceOriginWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"user_upload\","]
#[doc = "    \"model_output\","]
#[doc = "    \"tool_output\","]
#[doc = "    \"provider_file\","]
#[doc = "    \"remote_url\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ResourceOriginWire {
    #[serde(rename = "user_upload")]
    UserUpload,
    #[serde(rename = "model_output")]
    ModelOutput,
    #[serde(rename = "tool_output")]
    ToolOutput,
    #[serde(rename = "provider_file")]
    ProviderFile,
    #[serde(rename = "remote_url")]
    RemoteUrl,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for ResourceOriginWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UserUpload => f.write_str("user_upload"),
            Self::ModelOutput => f.write_str("model_output"),
            Self::ToolOutput => f.write_str("tool_output"),
            Self::ProviderFile => f.write_str("provider_file"),
            Self::RemoteUrl => f.write_str("remote_url"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for ResourceOriginWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "user_upload" => Ok(Self::UserUpload),
            "model_output" => Ok(Self::ModelOutput),
            "tool_output" => Ok(Self::ToolOutput),
            "provider_file" => Ok(Self::ProviderFile),
            "remote_url" => Ok(Self::RemoteUrl),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ResourceOriginWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ResourceOriginWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ResourceOriginWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ResourceSourceWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"provider\","]
#[doc = "    \"provider_file_id\","]
#[doc = "    \"provider_operation_id\","]
#[doc = "    \"source_expires_at\","]
#[doc = "    \"source_url\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"provider\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"provider_file_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"provider_operation_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"source_expires_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"source_url\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ResourceSourceWire {
    pub provider: NullableString,
    pub provider_file_id: NullableString,
    pub provider_operation_id: NullableString,
    pub source_expires_at: NullableInteger,
    pub source_url: NullableString,
}
#[doc = "`ResourceStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"pending\","]
#[doc = "    \"fetching\","]
#[doc = "    \"available\","]
#[doc = "    \"failed\","]
#[doc = "    \"expired\","]
#[doc = "    \"deleted\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ResourceStateWire {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "fetching")]
    Fetching,
    #[serde(rename = "available")]
    Available,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "deleted")]
    Deleted,
}
impl ::std::fmt::Display for ResourceStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Fetching => f.write_str("fetching"),
            Self::Available => f.write_str("available"),
            Self::Failed => f.write_str("failed"),
            Self::Expired => f.write_str("expired"),
            Self::Deleted => f.write_str("deleted"),
        }
    }
}
impl ::std::str::FromStr for ResourceStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "fetching" => Ok(Self::Fetching),
            "available" => Ok(Self::Available),
            "failed" => Ok(Self::Failed),
            "expired" => Ok(Self::Expired),
            "deleted" => Ok(Self::Deleted),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ResourceStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ResourceStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ResourceStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RetryPolicyWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"initial_delay_ms\","]
#[doc = "    \"max_delay_ms\","]
#[doc = "    \"strategy\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"initial_delay_ms\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"max_delay_ms\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"strategy\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"none\","]
#[doc = "        \"fixed\","]
#[doc = "        \"exponential\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RetryPolicyWire {
    pub initial_delay_ms: NullableInteger,
    pub max_delay_ms: NullableInteger,
    pub strategy: RetryPolicyWireStrategy,
}
#[doc = "`RetryPolicyWireStrategy`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"none\","]
#[doc = "    \"fixed\","]
#[doc = "    \"exponential\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RetryPolicyWireStrategy {
    #[serde(rename = "none")]
    None,
    #[serde(rename = "fixed")]
    Fixed,
    #[serde(rename = "exponential")]
    Exponential,
}
impl ::std::fmt::Display for RetryPolicyWireStrategy {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::None => f.write_str("none"),
            Self::Fixed => f.write_str("fixed"),
            Self::Exponential => f.write_str("exponential"),
        }
    }
}
impl ::std::str::FromStr for RetryPolicyWireStrategy {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "none" => Ok(Self::None),
            "fixed" => Ok(Self::Fixed),
            "exponential" => Ok(Self::Exponential),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RetryPolicyWireStrategy {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RetryPolicyWireStrategy {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RetryPolicyWireStrategy {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RevokeChannelBindingCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"revoke-channel-binding\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RevokeChannelBindingWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RevokeChannelBindingCommand {
    pub command: RevokeChannelBindingCommandCommand,
    pub request: RevokeChannelBindingWire,
}
#[doc = "`RevokeChannelBindingCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"revoke-channel-binding\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RevokeChannelBindingCommandCommand {
    #[serde(rename = "revoke-channel-binding")]
    RevokeChannelBinding,
}
impl ::std::fmt::Display for RevokeChannelBindingCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RevokeChannelBinding => f.write_str("revoke-channel-binding"),
        }
    }
}
impl ::std::str::FromStr for RevokeChannelBindingCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "revoke-channel-binding" => Ok(Self::RevokeChannelBinding),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RevokeChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RevokeChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RevokeChannelBindingCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RevokeChannelBindingWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"binding_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"binding_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RevokeChannelBindingWire {
    pub binding_id: ::std::string::String,
}
#[doc = "`RevokeConnectorCredentialCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"revoke-connector-credential\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/RevokeConnectorCredentialWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RevokeConnectorCredentialCommand {
    pub command: RevokeConnectorCredentialCommandCommand,
    pub request: RevokeConnectorCredentialWire,
}
#[doc = "`RevokeConnectorCredentialCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"revoke-connector-credential\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RevokeConnectorCredentialCommandCommand {
    #[serde(rename = "revoke-connector-credential")]
    RevokeConnectorCredential,
}
impl ::std::fmt::Display for RevokeConnectorCredentialCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RevokeConnectorCredential => f.write_str("revoke-connector-credential"),
        }
    }
}
impl ::std::str::FromStr for RevokeConnectorCredentialCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "revoke-connector-credential" => Ok(Self::RevokeConnectorCredential),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RevokeConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RevokeConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RevokeConnectorCredentialCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RevokeConnectorCredentialWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"credential_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"credential_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RevokeConnectorCredentialWire {
    pub credential_id: ::std::string::String,
}
#[doc = "`RunControlPolicyWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"queue_after_current\","]
#[doc = "    \"abort_current_then_run\","]
#[doc = "    \"steer_at_safe_point\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum RunControlPolicyWire {
    #[serde(rename = "queue_after_current")]
    QueueAfterCurrent,
    #[serde(rename = "abort_current_then_run")]
    AbortCurrentThenRun,
    #[serde(rename = "steer_at_safe_point")]
    SteerAtSafePoint,
}
impl ::std::fmt::Display for RunControlPolicyWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::QueueAfterCurrent => f.write_str("queue_after_current"),
            Self::AbortCurrentThenRun => f.write_str("abort_current_then_run"),
            Self::SteerAtSafePoint => f.write_str("steer_at_safe_point"),
        }
    }
}
impl ::std::str::FromStr for RunControlPolicyWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "queue_after_current" => Ok(Self::QueueAfterCurrent),
            "abort_current_then_run" => Ok(Self::AbortCurrentThenRun),
            "steer_at_safe_point" => Ok(Self::SteerAtSafePoint),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for RunControlPolicyWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for RunControlPolicyWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for RunControlPolicyWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`RuntimeEventInputWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"id\","]
#[doc = "    \"occurredAt\","]
#[doc = "    \"payload\","]
#[doc = "    \"scope\","]
#[doc = "    \"type\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"occurredAt\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"scope\": {"]
#[doc = "      \"$ref\": \"#/$defs/RuntimeEventScopeWire\""]
#[doc = "    },"]
#[doc = "    \"type\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RuntimeEventInputWire {
    pub id: ::std::string::String,
    #[serde(rename = "occurredAt")]
    pub occurred_at: i64,
    pub payload: ::serde_json::Value,
    pub scope: RuntimeEventScopeWire,
    #[serde(rename = "type")]
    pub type_: ::std::string::String,
}
#[doc = "`RuntimeEventScopeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"input_id\","]
#[doc = "    \"message_id\","]
#[doc = "    \"objective_id\","]
#[doc = "    \"plan_proposal_id\","]
#[doc = "    \"resource_id\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"message_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"objective_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"plan_proposal_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"resource_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct RuntimeEventScopeWire {
    pub input_id: NullableString,
    pub message_id: NullableString,
    pub objective_id: NullableString,
    pub plan_proposal_id: NullableString,
    pub resource_id: NullableString,
    pub run_id: NullableString,
    pub session_id: NullableString,
}
#[doc = "`RuntimeStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/AppendEventCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/QueryEventsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutConfigCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetConfigCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/WriteAtomicFileCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/IngestResourceCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetResourceCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListResourcesCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CreateResourceTicketCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CleanupExpiredResourceTicketsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/DoctorCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum RuntimeStorageRpcCommand {
    AppendEventCommand(AppendEventCommand),
    QueryEventsCommand(QueryEventsCommand),
    PutConfigCommand(PutConfigCommand),
    GetConfigCommand(GetConfigCommand),
    WriteAtomicFileCommand(WriteAtomicFileCommand),
    IngestResourceCommand(IngestResourceCommand),
    GetResourceCommand(GetResourceCommand),
    ListResourcesCommand(ListResourcesCommand),
    CreateResourceTicketCommand(CreateResourceTicketCommand),
    CleanupExpiredResourceTicketsCommand(CleanupExpiredResourceTicketsCommand),
    DoctorCommand(DoctorCommand),
}
impl ::std::convert::From<AppendEventCommand> for RuntimeStorageRpcCommand {
    fn from(value: AppendEventCommand) -> Self {
        Self::AppendEventCommand(value)
    }
}
impl ::std::convert::From<QueryEventsCommand> for RuntimeStorageRpcCommand {
    fn from(value: QueryEventsCommand) -> Self {
        Self::QueryEventsCommand(value)
    }
}
impl ::std::convert::From<PutConfigCommand> for RuntimeStorageRpcCommand {
    fn from(value: PutConfigCommand) -> Self {
        Self::PutConfigCommand(value)
    }
}
impl ::std::convert::From<GetConfigCommand> for RuntimeStorageRpcCommand {
    fn from(value: GetConfigCommand) -> Self {
        Self::GetConfigCommand(value)
    }
}
impl ::std::convert::From<WriteAtomicFileCommand> for RuntimeStorageRpcCommand {
    fn from(value: WriteAtomicFileCommand) -> Self {
        Self::WriteAtomicFileCommand(value)
    }
}
impl ::std::convert::From<IngestResourceCommand> for RuntimeStorageRpcCommand {
    fn from(value: IngestResourceCommand) -> Self {
        Self::IngestResourceCommand(value)
    }
}
impl ::std::convert::From<GetResourceCommand> for RuntimeStorageRpcCommand {
    fn from(value: GetResourceCommand) -> Self {
        Self::GetResourceCommand(value)
    }
}
impl ::std::convert::From<ListResourcesCommand> for RuntimeStorageRpcCommand {
    fn from(value: ListResourcesCommand) -> Self {
        Self::ListResourcesCommand(value)
    }
}
impl ::std::convert::From<CreateResourceTicketCommand> for RuntimeStorageRpcCommand {
    fn from(value: CreateResourceTicketCommand) -> Self {
        Self::CreateResourceTicketCommand(value)
    }
}
impl ::std::convert::From<CleanupExpiredResourceTicketsCommand> for RuntimeStorageRpcCommand {
    fn from(value: CleanupExpiredResourceTicketsCommand) -> Self {
        Self::CleanupExpiredResourceTicketsCommand(value)
    }
}
impl ::std::convert::From<DoctorCommand> for RuntimeStorageRpcCommand {
    fn from(value: DoctorCommand) -> Self {
        Self::DoctorCommand(value)
    }
}
#[doc = "`SchedulerJobKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"session.run\","]
#[doc = "    \"workspace.task\","]
#[doc = "    \"team.delivery\","]
#[doc = "    \"team.round.close\","]
#[doc = "    \"plugin.action\","]
#[doc = "    \"channel.delivery\","]
#[doc = "    \"tool.deferred_result\","]
#[doc = "    \"gateway.delivery\","]
#[doc = "    \"memory.compaction\","]
#[doc = "    \"resource.cleanup\","]
#[doc = "    \"budget.grant_expire\","]
#[doc = "    \"provider.retry\","]
#[doc = "    \"config.sync\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SchedulerJobKindWire {
    #[serde(rename = "session.run")]
    SessionRun,
    #[serde(rename = "workspace.task")]
    WorkspaceTask,
    #[serde(rename = "team.delivery")]
    TeamDelivery,
    #[serde(rename = "team.round.close")]
    TeamRoundClose,
    #[serde(rename = "plugin.action")]
    PluginAction,
    #[serde(rename = "channel.delivery")]
    ChannelDelivery,
    #[serde(rename = "tool.deferred_result")]
    ToolDeferredResult,
    #[serde(rename = "gateway.delivery")]
    GatewayDelivery,
    #[serde(rename = "memory.compaction")]
    MemoryCompaction,
    #[serde(rename = "resource.cleanup")]
    ResourceCleanup,
    #[serde(rename = "budget.grant_expire")]
    BudgetGrantExpire,
    #[serde(rename = "provider.retry")]
    ProviderRetry,
    #[serde(rename = "config.sync")]
    ConfigSync,
}
impl ::std::fmt::Display for SchedulerJobKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SessionRun => f.write_str("session.run"),
            Self::WorkspaceTask => f.write_str("workspace.task"),
            Self::TeamDelivery => f.write_str("team.delivery"),
            Self::TeamRoundClose => f.write_str("team.round.close"),
            Self::PluginAction => f.write_str("plugin.action"),
            Self::ChannelDelivery => f.write_str("channel.delivery"),
            Self::ToolDeferredResult => f.write_str("tool.deferred_result"),
            Self::GatewayDelivery => f.write_str("gateway.delivery"),
            Self::MemoryCompaction => f.write_str("memory.compaction"),
            Self::ResourceCleanup => f.write_str("resource.cleanup"),
            Self::BudgetGrantExpire => f.write_str("budget.grant_expire"),
            Self::ProviderRetry => f.write_str("provider.retry"),
            Self::ConfigSync => f.write_str("config.sync"),
        }
    }
}
impl ::std::str::FromStr for SchedulerJobKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "session.run" => Ok(Self::SessionRun),
            "workspace.task" => Ok(Self::WorkspaceTask),
            "team.delivery" => Ok(Self::TeamDelivery),
            "team.round.close" => Ok(Self::TeamRoundClose),
            "plugin.action" => Ok(Self::PluginAction),
            "channel.delivery" => Ok(Self::ChannelDelivery),
            "tool.deferred_result" => Ok(Self::ToolDeferredResult),
            "gateway.delivery" => Ok(Self::GatewayDelivery),
            "memory.compaction" => Ok(Self::MemoryCompaction),
            "resource.cleanup" => Ok(Self::ResourceCleanup),
            "budget.grant_expire" => Ok(Self::BudgetGrantExpire),
            "provider.retry" => Ok(Self::ProviderRetry),
            "config.sync" => Ok(Self::ConfigSync),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SchedulerJobKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SchedulerJobKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SchedulerJobKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SchedulerJobKindsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"array\","]
#[doc = "  \"items\": {"]
#[doc = "    \"$ref\": \"#/$defs/SchedulerJobKindWire\""]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct SchedulerJobKindsWire(pub ::std::vec::Vec<SchedulerJobKindWire>);
impl ::std::ops::Deref for SchedulerJobKindsWire {
    type Target = ::std::vec::Vec<SchedulerJobKindWire>;
    fn deref(&self) -> &::std::vec::Vec<SchedulerJobKindWire> {
        &self.0
    }
}
impl ::std::convert::From<SchedulerJobKindsWire> for ::std::vec::Vec<SchedulerJobKindWire> {
    fn from(value: SchedulerJobKindsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::vec::Vec<SchedulerJobKindWire>> for SchedulerJobKindsWire {
    fn from(value: ::std::vec::Vec<SchedulerJobKindWire>) -> Self {
        Self(value)
    }
}
#[doc = "`SchedulerJobStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"pending\","]
#[doc = "    \"ready\","]
#[doc = "    \"running\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"retry_scheduled\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SchedulerJobStateWire {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "ready")]
    Ready,
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "retry_scheduled")]
    RetryScheduled,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for SchedulerJobStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Ready => f.write_str("ready"),
            Self::Running => f.write_str("running"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::RetryScheduled => f.write_str("retry_scheduled"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for SchedulerJobStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "ready" => Ok(Self::Ready),
            "running" => Ok(Self::Running),
            "succeeded" => Ok(Self::Succeeded),
            "retry_scheduled" => Ok(Self::RetryScheduled),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SchedulerJobStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SchedulerJobStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SchedulerJobStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SchedulerStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ClaimRunnerCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/HeartbeatRunnerCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CompleteRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/FailRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ReleaseRunnerCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CancelRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ReserveBudgetCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CommitBudgetCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecordBudgetUsageCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ReleaseBudgetCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetBudgetScopeCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListBudgetGrantsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/EnqueueJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ClaimJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/HeartbeatJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CompleteJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/FailJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CancelJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetJobCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListJobsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum SchedulerStorageRpcCommand {
    ClaimRunnerCommand(ClaimRunnerCommand),
    HeartbeatRunnerCommand(HeartbeatRunnerCommand),
    CompleteRunCommand(CompleteRunCommand),
    FailRunCommand(FailRunCommand),
    ReleaseRunnerCommand(ReleaseRunnerCommand),
    CancelRunCommand(CancelRunCommand),
    ReserveBudgetCommand(ReserveBudgetCommand),
    CommitBudgetCommand(CommitBudgetCommand),
    RecordBudgetUsageCommand(RecordBudgetUsageCommand),
    ReleaseBudgetCommand(ReleaseBudgetCommand),
    GetBudgetScopeCommand(GetBudgetScopeCommand),
    ListBudgetGrantsCommand(ListBudgetGrantsCommand),
    EnqueueJobCommand(EnqueueJobCommand),
    ClaimJobCommand(ClaimJobCommand),
    HeartbeatJobCommand(HeartbeatJobCommand),
    CompleteJobCommand(CompleteJobCommand),
    FailJobCommand(FailJobCommand),
    CancelJobCommand(CancelJobCommand),
    GetJobCommand(GetJobCommand),
    ListJobsCommand(ListJobsCommand),
}
impl ::std::convert::From<ClaimRunnerCommand> for SchedulerStorageRpcCommand {
    fn from(value: ClaimRunnerCommand) -> Self {
        Self::ClaimRunnerCommand(value)
    }
}
impl ::std::convert::From<HeartbeatRunnerCommand> for SchedulerStorageRpcCommand {
    fn from(value: HeartbeatRunnerCommand) -> Self {
        Self::HeartbeatRunnerCommand(value)
    }
}
impl ::std::convert::From<CompleteRunCommand> for SchedulerStorageRpcCommand {
    fn from(value: CompleteRunCommand) -> Self {
        Self::CompleteRunCommand(value)
    }
}
impl ::std::convert::From<FailRunCommand> for SchedulerStorageRpcCommand {
    fn from(value: FailRunCommand) -> Self {
        Self::FailRunCommand(value)
    }
}
impl ::std::convert::From<ReleaseRunnerCommand> for SchedulerStorageRpcCommand {
    fn from(value: ReleaseRunnerCommand) -> Self {
        Self::ReleaseRunnerCommand(value)
    }
}
impl ::std::convert::From<CancelRunCommand> for SchedulerStorageRpcCommand {
    fn from(value: CancelRunCommand) -> Self {
        Self::CancelRunCommand(value)
    }
}
impl ::std::convert::From<ReserveBudgetCommand> for SchedulerStorageRpcCommand {
    fn from(value: ReserveBudgetCommand) -> Self {
        Self::ReserveBudgetCommand(value)
    }
}
impl ::std::convert::From<CommitBudgetCommand> for SchedulerStorageRpcCommand {
    fn from(value: CommitBudgetCommand) -> Self {
        Self::CommitBudgetCommand(value)
    }
}
impl ::std::convert::From<RecordBudgetUsageCommand> for SchedulerStorageRpcCommand {
    fn from(value: RecordBudgetUsageCommand) -> Self {
        Self::RecordBudgetUsageCommand(value)
    }
}
impl ::std::convert::From<ReleaseBudgetCommand> for SchedulerStorageRpcCommand {
    fn from(value: ReleaseBudgetCommand) -> Self {
        Self::ReleaseBudgetCommand(value)
    }
}
impl ::std::convert::From<GetBudgetScopeCommand> for SchedulerStorageRpcCommand {
    fn from(value: GetBudgetScopeCommand) -> Self {
        Self::GetBudgetScopeCommand(value)
    }
}
impl ::std::convert::From<ListBudgetGrantsCommand> for SchedulerStorageRpcCommand {
    fn from(value: ListBudgetGrantsCommand) -> Self {
        Self::ListBudgetGrantsCommand(value)
    }
}
impl ::std::convert::From<EnqueueJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: EnqueueJobCommand) -> Self {
        Self::EnqueueJobCommand(value)
    }
}
impl ::std::convert::From<ClaimJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: ClaimJobCommand) -> Self {
        Self::ClaimJobCommand(value)
    }
}
impl ::std::convert::From<HeartbeatJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: HeartbeatJobCommand) -> Self {
        Self::HeartbeatJobCommand(value)
    }
}
impl ::std::convert::From<CompleteJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: CompleteJobCommand) -> Self {
        Self::CompleteJobCommand(value)
    }
}
impl ::std::convert::From<FailJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: FailJobCommand) -> Self {
        Self::FailJobCommand(value)
    }
}
impl ::std::convert::From<CancelJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: CancelJobCommand) -> Self {
        Self::CancelJobCommand(value)
    }
}
impl ::std::convert::From<GetJobCommand> for SchedulerStorageRpcCommand {
    fn from(value: GetJobCommand) -> Self {
        Self::GetJobCommand(value)
    }
}
impl ::std::convert::From<ListJobsCommand> for SchedulerStorageRpcCommand {
    fn from(value: ListJobsCommand) -> Self {
        Self::ListJobsCommand(value)
    }
}
#[doc = "`SessionInputIntentWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"normal\","]
#[doc = "    \"follow_up\","]
#[doc = "    \"steer\","]
#[doc = "    \"interrupt\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionInputIntentWire {
    #[serde(rename = "normal")]
    Normal,
    #[serde(rename = "follow_up")]
    FollowUp,
    #[serde(rename = "steer")]
    Steer,
    #[serde(rename = "interrupt")]
    Interrupt,
}
impl ::std::fmt::Display for SessionInputIntentWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Normal => f.write_str("normal"),
            Self::FollowUp => f.write_str("follow_up"),
            Self::Steer => f.write_str("steer"),
            Self::Interrupt => f.write_str("interrupt"),
        }
    }
}
impl ::std::str::FromStr for SessionInputIntentWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "normal" => Ok(Self::Normal),
            "follow_up" => Ok(Self::FollowUp),
            "steer" => Ok(Self::Steer),
            "interrupt" => Ok(Self::Interrupt),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionInputIntentWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionInputIntentWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionInputIntentWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionInputOriginWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"kind\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"kind\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"interactive\","]
#[doc = "        \"scheduler\","]
#[doc = "        \"connector\","]
#[doc = "        \"agent\","]
#[doc = "        \"system\","]
#[doc = "        \"objective\","]
#[doc = "        \"plan\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonObjectWire\""]
#[doc = "    },"]
#[doc = "    \"parentRef\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"sourceRef\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SessionInputOriginWire {
    pub kind: SessionInputOriginWireKind,
    #[serde(default, skip_serializing_if = "::std::option::Option::is_none")]
    pub metadata: ::std::option::Option<JsonObjectWire>,
    #[serde(
        rename = "parentRef",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub parent_ref: ::std::option::Option<::std::string::String>,
    #[serde(
        rename = "sourceRef",
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub source_ref: ::std::option::Option<::std::string::String>,
}
#[doc = "`SessionInputOriginWireKind`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"interactive\","]
#[doc = "    \"scheduler\","]
#[doc = "    \"connector\","]
#[doc = "    \"agent\","]
#[doc = "    \"system\","]
#[doc = "    \"objective\","]
#[doc = "    \"plan\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionInputOriginWireKind {
    #[serde(rename = "interactive")]
    Interactive,
    #[serde(rename = "scheduler")]
    Scheduler,
    #[serde(rename = "connector")]
    Connector,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "system")]
    System,
    #[serde(rename = "objective")]
    Objective,
    #[serde(rename = "plan")]
    Plan,
}
impl ::std::fmt::Display for SessionInputOriginWireKind {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Interactive => f.write_str("interactive"),
            Self::Scheduler => f.write_str("scheduler"),
            Self::Connector => f.write_str("connector"),
            Self::Agent => f.write_str("agent"),
            Self::System => f.write_str("system"),
            Self::Objective => f.write_str("objective"),
            Self::Plan => f.write_str("plan"),
        }
    }
}
impl ::std::str::FromStr for SessionInputOriginWireKind {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "interactive" => Ok(Self::Interactive),
            "scheduler" => Ok(Self::Scheduler),
            "connector" => Ok(Self::Connector),
            "agent" => Ok(Self::Agent),
            "system" => Ok(Self::System),
            "objective" => Ok(Self::Objective),
            "plan" => Ok(Self::Plan),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionInputOriginWireKind {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionInputOriginWireKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionInputOriginWireKind {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"chat\","]
#[doc = "    \"agent\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionKindWire {
    #[serde(rename = "chat")]
    Chat,
    #[serde(rename = "agent")]
    Agent,
}
impl ::std::fmt::Display for SessionKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Chat => f.write_str("chat"),
            Self::Agent => f.write_str("agent"),
        }
    }
}
impl ::std::str::FromStr for SessionKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "chat" => Ok(Self::Chat),
            "agent" => Ok(Self::Agent),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionRunControlKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"interrupt\","]
#[doc = "    \"steer\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionRunControlKindWire {
    #[serde(rename = "interrupt")]
    Interrupt,
    #[serde(rename = "steer")]
    Steer,
}
impl ::std::fmt::Display for SessionRunControlKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Interrupt => f.write_str("interrupt"),
            Self::Steer => f.write_str("steer"),
        }
    }
}
impl ::std::str::FromStr for SessionRunControlKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "interrupt" => Ok(Self::Interrupt),
            "steer" => Ok(Self::Steer),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionRunControlKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionRunControlKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionRunControlKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionRunControlStatusWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"pending\","]
#[doc = "    \"applied\","]
#[doc = "    \"rejected\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionRunControlStatusWire {
    #[serde(rename = "pending")]
    Pending,
    #[serde(rename = "applied")]
    Applied,
    #[serde(rename = "rejected")]
    Rejected,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for SessionRunControlStatusWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Pending => f.write_str("pending"),
            Self::Applied => f.write_str("applied"),
            Self::Rejected => f.write_str("rejected"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for SessionRunControlStatusWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "pending" => Ok(Self::Pending),
            "applied" => Ok(Self::Applied),
            "rejected" => Ok(Self::Rejected),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionRunControlStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionRunControlStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionRunControlStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionRunModeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"once\","]
#[doc = "    \"to_completion\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionRunModeWire {
    #[serde(rename = "once")]
    Once,
    #[serde(rename = "to_completion")]
    ToCompletion,
}
impl ::std::fmt::Display for SessionRunModeWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Once => f.write_str("once"),
            Self::ToCompletion => f.write_str("to_completion"),
        }
    }
}
impl ::std::str::FromStr for SessionRunModeWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "once" => Ok(Self::Once),
            "to_completion" => Ok(Self::ToCompletion),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionRunModeWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionRunModeWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionRunModeWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionStatusWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"active\","]
#[doc = "    \"archived\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SessionStatusWire {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "archived")]
    Archived,
}
impl ::std::fmt::Display for SessionStatusWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Archived => f.write_str("archived"),
        }
    }
}
impl ::std::str::FromStr for SessionStatusWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "archived" => Ok(Self::Archived),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SessionStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SessionStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SessionStatusWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SessionsStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/CreateSessionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetSessionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/AdmitSessionInputCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitSessionRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/InterruptSessionRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SteerSessionRunCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionRunControlsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ApplySessionRunControlCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionInputsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListSessionMessagesCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/AppendSessionMessageCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum SessionsStorageRpcCommand {
    CreateSessionCommand(CreateSessionCommand),
    GetSessionCommand(GetSessionCommand),
    ListSessionsCommand(ListSessionsCommand),
    AdmitSessionInputCommand(AdmitSessionInputCommand),
    SubmitSessionRunCommand(SubmitSessionRunCommand),
    InterruptSessionRunCommand(InterruptSessionRunCommand),
    SteerSessionRunCommand(SteerSessionRunCommand),
    ListSessionRunControlsCommand(ListSessionRunControlsCommand),
    ApplySessionRunControlCommand(ApplySessionRunControlCommand),
    ListSessionInputsCommand(ListSessionInputsCommand),
    ListSessionMessagesCommand(ListSessionMessagesCommand),
    AppendSessionMessageCommand(AppendSessionMessageCommand),
}
impl ::std::convert::From<CreateSessionCommand> for SessionsStorageRpcCommand {
    fn from(value: CreateSessionCommand) -> Self {
        Self::CreateSessionCommand(value)
    }
}
impl ::std::convert::From<GetSessionCommand> for SessionsStorageRpcCommand {
    fn from(value: GetSessionCommand) -> Self {
        Self::GetSessionCommand(value)
    }
}
impl ::std::convert::From<ListSessionsCommand> for SessionsStorageRpcCommand {
    fn from(value: ListSessionsCommand) -> Self {
        Self::ListSessionsCommand(value)
    }
}
impl ::std::convert::From<AdmitSessionInputCommand> for SessionsStorageRpcCommand {
    fn from(value: AdmitSessionInputCommand) -> Self {
        Self::AdmitSessionInputCommand(value)
    }
}
impl ::std::convert::From<SubmitSessionRunCommand> for SessionsStorageRpcCommand {
    fn from(value: SubmitSessionRunCommand) -> Self {
        Self::SubmitSessionRunCommand(value)
    }
}
impl ::std::convert::From<InterruptSessionRunCommand> for SessionsStorageRpcCommand {
    fn from(value: InterruptSessionRunCommand) -> Self {
        Self::InterruptSessionRunCommand(value)
    }
}
impl ::std::convert::From<SteerSessionRunCommand> for SessionsStorageRpcCommand {
    fn from(value: SteerSessionRunCommand) -> Self {
        Self::SteerSessionRunCommand(value)
    }
}
impl ::std::convert::From<ListSessionRunControlsCommand> for SessionsStorageRpcCommand {
    fn from(value: ListSessionRunControlsCommand) -> Self {
        Self::ListSessionRunControlsCommand(value)
    }
}
impl ::std::convert::From<ApplySessionRunControlCommand> for SessionsStorageRpcCommand {
    fn from(value: ApplySessionRunControlCommand) -> Self {
        Self::ApplySessionRunControlCommand(value)
    }
}
impl ::std::convert::From<ListSessionInputsCommand> for SessionsStorageRpcCommand {
    fn from(value: ListSessionInputsCommand) -> Self {
        Self::ListSessionInputsCommand(value)
    }
}
impl ::std::convert::From<ListSessionMessagesCommand> for SessionsStorageRpcCommand {
    fn from(value: ListSessionMessagesCommand) -> Self {
        Self::ListSessionMessagesCommand(value)
    }
}
impl ::std::convert::From<AppendSessionMessageCommand> for SessionsStorageRpcCommand {
    fn from(value: AppendSessionMessageCommand) -> Self {
        Self::AppendSessionMessageCommand(value)
    }
}
#[doc = "`StartConnectorSessionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"start-connector-session\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/StartConnectorSessionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StartConnectorSessionCommand {
    pub command: StartConnectorSessionCommandCommand,
    pub request: StartConnectorSessionWire,
}
#[doc = "`StartConnectorSessionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"start-connector-session\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum StartConnectorSessionCommandCommand {
    #[serde(rename = "start-connector-session")]
    StartConnectorSession,
}
impl ::std::fmt::Display for StartConnectorSessionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::StartConnectorSession => f.write_str("start-connector-session"),
        }
    }
}
impl ::std::str::FromStr for StartConnectorSessionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "start-connector-session" => Ok(Self::StartConnectorSession),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StartConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StartConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StartConnectorSessionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`StartConnectorSessionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"credential_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"lease_ms\","]
#[doc = "    \"metadata\","]
#[doc = "    \"owner_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"credential_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"lease_ms\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"owner_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableConnectorLiveSessionStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StartConnectorSessionWire {
    pub connector_id: ::std::string::String,
    pub credential_id: ::std::string::String,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub lease_ms: i64,
    pub metadata: ::serde_json::Value,
    pub owner_id: ::std::string::String,
    pub state: NullableConnectorLiveSessionStateWire,
}
#[doc = "`SteerSessionRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"steer-session-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/SteerSessionRunWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SteerSessionRunCommand {
    pub command: SteerSessionRunCommandCommand,
    pub request: SteerSessionRunWire,
}
#[doc = "`SteerSessionRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"steer-session-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SteerSessionRunCommandCommand {
    #[serde(rename = "steer-session-run")]
    SteerSessionRun,
}
impl ::std::fmt::Display for SteerSessionRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SteerSessionRun => f.write_str("steer-session-run"),
        }
    }
}
impl ::std::str::FromStr for SteerSessionRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "steer-session-run" => Ok(Self::SteerSessionRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SteerSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SteerSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SteerSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SteerSessionRunWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"content\","]
#[doc = "    \"expected_run_id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"metadata\","]
#[doc = "    \"origin\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"provider_profile_id\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"content\": {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"expected_run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableJsonObjectWire\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputOriginWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"provider_profile_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SteerSessionRunWire {
    pub content: MessagePartsWire,
    pub expected_run_id: ::std::string::String,
    pub idempotency_key: ::std::string::String,
    pub metadata: NullableJsonObjectWire,
    pub origin: NullableSessionInputOriginWire,
    pub principal_id: ::std::string::String,
    pub provider_profile_id: NullableString,
    pub session_id: ::std::string::String,
}
#[doc = "`StorageRpcCapability`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"storage.runtime\","]
#[doc = "    \"storage.sessions\","]
#[doc = "    \"storage.context\","]
#[doc = "    \"storage.scheduler\","]
#[doc = "    \"storage.tools\","]
#[doc = "    \"storage.workspace\","]
#[doc = "    \"storage.plan\","]
#[doc = "    \"storage.objective\","]
#[doc = "    \"storage.delegation\","]
#[doc = "    \"storage.team\","]
#[doc = "    \"storage.plugin\","]
#[doc = "    \"storage.connector\","]
#[doc = "    \"storage.channel\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum StorageRpcCapability {
    #[serde(rename = "storage.runtime")]
    StorageRuntime,
    #[serde(rename = "storage.sessions")]
    StorageSessions,
    #[serde(rename = "storage.context")]
    StorageContext,
    #[serde(rename = "storage.scheduler")]
    StorageScheduler,
    #[serde(rename = "storage.tools")]
    StorageTools,
    #[serde(rename = "storage.workspace")]
    StorageWorkspace,
    #[serde(rename = "storage.plan")]
    StoragePlan,
    #[serde(rename = "storage.objective")]
    StorageObjective,
    #[serde(rename = "storage.delegation")]
    StorageDelegation,
    #[serde(rename = "storage.team")]
    StorageTeam,
    #[serde(rename = "storage.plugin")]
    StoragePlugin,
    #[serde(rename = "storage.connector")]
    StorageConnector,
    #[serde(rename = "storage.channel")]
    StorageChannel,
}
impl ::std::fmt::Display for StorageRpcCapability {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::StorageRuntime => f.write_str("storage.runtime"),
            Self::StorageSessions => f.write_str("storage.sessions"),
            Self::StorageContext => f.write_str("storage.context"),
            Self::StorageScheduler => f.write_str("storage.scheduler"),
            Self::StorageTools => f.write_str("storage.tools"),
            Self::StorageWorkspace => f.write_str("storage.workspace"),
            Self::StoragePlan => f.write_str("storage.plan"),
            Self::StorageObjective => f.write_str("storage.objective"),
            Self::StorageDelegation => f.write_str("storage.delegation"),
            Self::StorageTeam => f.write_str("storage.team"),
            Self::StoragePlugin => f.write_str("storage.plugin"),
            Self::StorageConnector => f.write_str("storage.connector"),
            Self::StorageChannel => f.write_str("storage.channel"),
        }
    }
}
impl ::std::str::FromStr for StorageRpcCapability {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "storage.runtime" => Ok(Self::StorageRuntime),
            "storage.sessions" => Ok(Self::StorageSessions),
            "storage.context" => Ok(Self::StorageContext),
            "storage.scheduler" => Ok(Self::StorageScheduler),
            "storage.tools" => Ok(Self::StorageTools),
            "storage.workspace" => Ok(Self::StorageWorkspace),
            "storage.plan" => Ok(Self::StoragePlan),
            "storage.objective" => Ok(Self::StorageObjective),
            "storage.delegation" => Ok(Self::StorageDelegation),
            "storage.team" => Ok(Self::StorageTeam),
            "storage.plugin" => Ok(Self::StoragePlugin),
            "storage.connector" => Ok(Self::StorageConnector),
            "storage.channel" => Ok(Self::StorageChannel),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcCapability {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcCapability {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcCapability {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`StorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcDescribeCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RuntimeStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SessionsStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ContextStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/SchedulerStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ToolsStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/WorkspaceStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PlanStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ObjectiveStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/TeamStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PluginStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorStorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ChannelStorageRpcCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum StorageRpcCommand {
    StorageRpcDescribeCommand(StorageRpcDescribeCommand),
    RuntimeStorageRpcCommand(RuntimeStorageRpcCommand),
    SessionsStorageRpcCommand(SessionsStorageRpcCommand),
    ContextStorageRpcCommand(ContextStorageRpcCommand),
    SchedulerStorageRpcCommand(SchedulerStorageRpcCommand),
    ToolsStorageRpcCommand(ToolsStorageRpcCommand),
    WorkspaceStorageRpcCommand(WorkspaceStorageRpcCommand),
    PlanStorageRpcCommand(PlanStorageRpcCommand),
    ObjectiveStorageRpcCommand(ObjectiveStorageRpcCommand),
    DelegationStorageRpcCommand(DelegationStorageRpcCommand),
    TeamStorageRpcCommand(TeamStorageRpcCommand),
    PluginStorageRpcCommand(PluginStorageRpcCommand),
    ConnectorStorageRpcCommand(ConnectorStorageRpcCommand),
    ChannelStorageRpcCommand(ChannelStorageRpcCommand),
}
impl ::std::convert::From<StorageRpcDescribeCommand> for StorageRpcCommand {
    fn from(value: StorageRpcDescribeCommand) -> Self {
        Self::StorageRpcDescribeCommand(value)
    }
}
impl ::std::convert::From<RuntimeStorageRpcCommand> for StorageRpcCommand {
    fn from(value: RuntimeStorageRpcCommand) -> Self {
        Self::RuntimeStorageRpcCommand(value)
    }
}
impl ::std::convert::From<SessionsStorageRpcCommand> for StorageRpcCommand {
    fn from(value: SessionsStorageRpcCommand) -> Self {
        Self::SessionsStorageRpcCommand(value)
    }
}
impl ::std::convert::From<ContextStorageRpcCommand> for StorageRpcCommand {
    fn from(value: ContextStorageRpcCommand) -> Self {
        Self::ContextStorageRpcCommand(value)
    }
}
impl ::std::convert::From<SchedulerStorageRpcCommand> for StorageRpcCommand {
    fn from(value: SchedulerStorageRpcCommand) -> Self {
        Self::SchedulerStorageRpcCommand(value)
    }
}
impl ::std::convert::From<ToolsStorageRpcCommand> for StorageRpcCommand {
    fn from(value: ToolsStorageRpcCommand) -> Self {
        Self::ToolsStorageRpcCommand(value)
    }
}
impl ::std::convert::From<WorkspaceStorageRpcCommand> for StorageRpcCommand {
    fn from(value: WorkspaceStorageRpcCommand) -> Self {
        Self::WorkspaceStorageRpcCommand(value)
    }
}
impl ::std::convert::From<PlanStorageRpcCommand> for StorageRpcCommand {
    fn from(value: PlanStorageRpcCommand) -> Self {
        Self::PlanStorageRpcCommand(value)
    }
}
impl ::std::convert::From<ObjectiveStorageRpcCommand> for StorageRpcCommand {
    fn from(value: ObjectiveStorageRpcCommand) -> Self {
        Self::ObjectiveStorageRpcCommand(value)
    }
}
impl ::std::convert::From<DelegationStorageRpcCommand> for StorageRpcCommand {
    fn from(value: DelegationStorageRpcCommand) -> Self {
        Self::DelegationStorageRpcCommand(value)
    }
}
impl ::std::convert::From<TeamStorageRpcCommand> for StorageRpcCommand {
    fn from(value: TeamStorageRpcCommand) -> Self {
        Self::TeamStorageRpcCommand(value)
    }
}
impl ::std::convert::From<PluginStorageRpcCommand> for StorageRpcCommand {
    fn from(value: PluginStorageRpcCommand) -> Self {
        Self::PluginStorageRpcCommand(value)
    }
}
impl ::std::convert::From<ConnectorStorageRpcCommand> for StorageRpcCommand {
    fn from(value: ConnectorStorageRpcCommand) -> Self {
        Self::ConnectorStorageRpcCommand(value)
    }
}
impl ::std::convert::From<ChannelStorageRpcCommand> for StorageRpcCommand {
    fn from(value: ChannelStorageRpcCommand) -> Self {
        Self::ChannelStorageRpcCommand(value)
    }
}
#[doc = "`StorageRpcDescribeCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"rpc-describe\""]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcDescribeCommand {
    pub command: StorageRpcDescribeCommandCommand,
}
#[doc = "`StorageRpcDescribeCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"rpc-describe\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum StorageRpcDescribeCommandCommand {
    #[serde(rename = "rpc-describe")]
    RpcDescribe,
}
impl ::std::fmt::Display for StorageRpcDescribeCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::RpcDescribe => f.write_str("rpc-describe"),
        }
    }
}
impl ::std::str::FromStr for StorageRpcDescribeCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "rpc-describe" => Ok(Self::RpcDescribe),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcDescribeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcDescribeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcDescribeCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`StorageRpcDescriptor`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"capabilities\","]
#[doc = "    \"schema_sha256\","]
#[doc = "    \"selected_version\","]
#[doc = "    \"service_version\","]
#[doc = "    \"supported_versions\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"capabilities\": {"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/$defs/StorageRpcCapability\""]
#[doc = "      },"]
#[doc = "      \"uniqueItems\": true"]
#[doc = "    },"]
#[doc = "    \"schema_sha256\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"maxLength\": 64,"]
#[doc = "      \"minLength\": 64"]
#[doc = "    },"]
#[doc = "    \"selected_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcVersion\""]
#[doc = "    },"]
#[doc = "    \"service_version\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"minLength\": 1"]
#[doc = "    },"]
#[doc = "    \"supported_versions\": {"]
#[doc = "      \"type\": \"array\","]
#[doc = "      \"items\": {"]
#[doc = "        \"$ref\": \"#/$defs/StorageRpcVersion\""]
#[doc = "      },"]
#[doc = "      \"minItems\": 1,"]
#[doc = "      \"uniqueItems\": true"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcDescriptor {
    pub capabilities: Vec<StorageRpcCapability>,
    pub schema_sha256: StorageRpcDescriptorSchemaSha256,
    pub selected_version: StorageRpcVersion,
    pub service_version: StorageRpcDescriptorServiceVersion,
    pub supported_versions: Vec<StorageRpcVersion>,
}
#[doc = "`StorageRpcDescriptorSchemaSha256`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"maxLength\": 64,"]
#[doc = "  \"minLength\": 64"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct StorageRpcDescriptorSchemaSha256(::std::string::String);
impl ::std::ops::Deref for StorageRpcDescriptorSchemaSha256 {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<StorageRpcDescriptorSchemaSha256> for ::std::string::String {
    fn from(value: StorageRpcDescriptorSchemaSha256) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for StorageRpcDescriptorSchemaSha256 {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() > 64usize {
            return Err("longer than 64 characters".into());
        }
        if value.chars().count() < 64usize {
            return Err("shorter than 64 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcDescriptorSchemaSha256 {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcDescriptorSchemaSha256 {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcDescriptorSchemaSha256 {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for StorageRpcDescriptorSchemaSha256 {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`StorageRpcDescriptorServiceVersion`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"minLength\": 1"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct StorageRpcDescriptorServiceVersion(::std::string::String);
impl ::std::ops::Deref for StorageRpcDescriptorServiceVersion {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<StorageRpcDescriptorServiceVersion> for ::std::string::String {
    fn from(value: StorageRpcDescriptorServiceVersion) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for StorageRpcDescriptorServiceVersion {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcDescriptorServiceVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcDescriptorServiceVersion {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcDescriptorServiceVersion {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for StorageRpcDescriptorServiceVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`StorageRpcError`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"code\","]
#[doc = "    \"message\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"code\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcErrorCode\""]
#[doc = "    },"]
#[doc = "    \"message\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcError {
    pub code: StorageRpcErrorCode,
    pub message: ::std::string::String,
}
#[doc = "`StorageRpcErrorCode`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcProtocolErrorCode\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcServiceErrorCode\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum StorageRpcErrorCode {
    ProtocolErrorCode(StorageRpcProtocolErrorCode),
    ServiceErrorCode(StorageRpcServiceErrorCode),
}
impl ::std::convert::From<StorageRpcProtocolErrorCode> for StorageRpcErrorCode {
    fn from(value: StorageRpcProtocolErrorCode) -> Self {
        Self::ProtocolErrorCode(value)
    }
}
impl ::std::convert::From<StorageRpcServiceErrorCode> for StorageRpcErrorCode {
    fn from(value: StorageRpcServiceErrorCode) -> Self {
        Self::ServiceErrorCode(value)
    }
}
#[doc = "`StorageRpcErrorEnvelope`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"error\","]
#[doc = "    \"ok\","]
#[doc = "    \"request_id\","]
#[doc = "    \"storage_rpc_version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcError\""]
#[doc = "    },"]
#[doc = "    \"ok\": {"]
#[doc = "      \"type\": \"boolean\","]
#[doc = "      \"enum\": ["]
#[doc = "        false"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request_id\": {"]
#[doc = "      \"oneOf\": ["]
#[doc = "        {"]
#[doc = "          \"$ref\": \"#/$defs/StorageRpcRequestId\""]
#[doc = "        },"]
#[doc = "        {"]
#[doc = "          \"type\": \"null\""]
#[doc = "        }"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"storage_rpc_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcVersion\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcErrorEnvelope {
    pub error: StorageRpcError,
    pub ok: bool,
    pub request_id: ::std::option::Option<StorageRpcRequestId>,
    pub storage_rpc_version: StorageRpcVersion,
}
#[doc = "`StorageRpcProtocolErrorCode`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"unsupported_storage_rpc_version\","]
#[doc = "    \"invalid_storage_rpc_envelope\","]
#[doc = "    \"unknown_storage_rpc_command\","]
#[doc = "    \"storage_rpc_request_id_mismatch\","]
#[doc = "    \"storage_rpc_response_version_mismatch\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum StorageRpcProtocolErrorCode {
    #[serde(rename = "unsupported_storage_rpc_version")]
    UnsupportedStorageRpcVersion,
    #[serde(rename = "invalid_storage_rpc_envelope")]
    InvalidStorageRpcEnvelope,
    #[serde(rename = "unknown_storage_rpc_command")]
    UnknownStorageRpcCommand,
    #[serde(rename = "storage_rpc_request_id_mismatch")]
    StorageRpcRequestIdMismatch,
    #[serde(rename = "storage_rpc_response_version_mismatch")]
    StorageRpcResponseVersionMismatch,
}
impl ::std::fmt::Display for StorageRpcProtocolErrorCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UnsupportedStorageRpcVersion => f.write_str("unsupported_storage_rpc_version"),
            Self::InvalidStorageRpcEnvelope => f.write_str("invalid_storage_rpc_envelope"),
            Self::UnknownStorageRpcCommand => f.write_str("unknown_storage_rpc_command"),
            Self::StorageRpcRequestIdMismatch => f.write_str("storage_rpc_request_id_mismatch"),
            Self::StorageRpcResponseVersionMismatch => {
                f.write_str("storage_rpc_response_version_mismatch")
            }
        }
    }
}
impl ::std::str::FromStr for StorageRpcProtocolErrorCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "unsupported_storage_rpc_version" => Ok(Self::UnsupportedStorageRpcVersion),
            "invalid_storage_rpc_envelope" => Ok(Self::InvalidStorageRpcEnvelope),
            "unknown_storage_rpc_command" => Ok(Self::UnknownStorageRpcCommand),
            "storage_rpc_request_id_mismatch" => Ok(Self::StorageRpcRequestIdMismatch),
            "storage_rpc_response_version_mismatch" => Ok(Self::StorageRpcResponseVersionMismatch),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcProtocolErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcProtocolErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcProtocolErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`StorageRpcRequestEnvelope`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"request\","]
#[doc = "    \"request_id\","]
#[doc = "    \"storage_rpc_version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcCommand\""]
#[doc = "    },"]
#[doc = "    \"request_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcRequestId\""]
#[doc = "    },"]
#[doc = "    \"storage_rpc_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcVersion\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcRequestEnvelope {
    pub request: StorageRpcCommand,
    pub request_id: StorageRpcRequestId,
    pub storage_rpc_version: StorageRpcVersion,
}
#[doc = "`StorageRpcRequestId`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"minLength\": 1"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Serialize, Clone, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
#[serde(transparent)]
pub struct StorageRpcRequestId(::std::string::String);
impl ::std::ops::Deref for StorageRpcRequestId {
    type Target = ::std::string::String;
    fn deref(&self) -> &::std::string::String {
        &self.0
    }
}
impl ::std::convert::From<StorageRpcRequestId> for ::std::string::String {
    fn from(value: StorageRpcRequestId) -> Self {
        value.0
    }
}
impl ::std::str::FromStr for StorageRpcRequestId {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        if value.chars().count() < 1usize {
            return Err("shorter than 1 characters".into());
        }
        Ok(Self(value.to_string()))
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcRequestId {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcRequestId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcRequestId {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl<'de> ::serde::Deserialize<'de> for StorageRpcRequestId {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        ::std::string::String::deserialize(deserializer)?
            .parse()
            .map_err(|e: self::error::ConversionError| {
                <D::Error as ::serde::de::Error>::custom(e.to_string())
            })
    }
}
#[doc = "`StorageRpcServiceErrorCode`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"sqlite\","]
#[doc = "    \"io\","]
#[doc = "    \"json\","]
#[doc = "    \"invalid_input\","]
#[doc = "    \"sha256_mismatch\","]
#[doc = "    \"budget_denied\","]
#[doc = "    \"invalid_job_request\","]
#[doc = "    \"invariant\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum StorageRpcServiceErrorCode {
    #[serde(rename = "sqlite")]
    Sqlite,
    #[serde(rename = "io")]
    Io,
    #[serde(rename = "json")]
    Json,
    #[serde(rename = "invalid_input")]
    InvalidInput,
    #[serde(rename = "sha256_mismatch")]
    Sha256Mismatch,
    #[serde(rename = "budget_denied")]
    BudgetDenied,
    #[serde(rename = "invalid_job_request")]
    InvalidJobRequest,
    #[serde(rename = "invariant")]
    Invariant,
}
impl ::std::fmt::Display for StorageRpcServiceErrorCode {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Sqlite => f.write_str("sqlite"),
            Self::Io => f.write_str("io"),
            Self::Json => f.write_str("json"),
            Self::InvalidInput => f.write_str("invalid_input"),
            Self::Sha256Mismatch => f.write_str("sha256_mismatch"),
            Self::BudgetDenied => f.write_str("budget_denied"),
            Self::InvalidJobRequest => f.write_str("invalid_job_request"),
            Self::Invariant => f.write_str("invariant"),
        }
    }
}
impl ::std::str::FromStr for StorageRpcServiceErrorCode {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "sqlite" => Ok(Self::Sqlite),
            "io" => Ok(Self::Io),
            "json" => Ok(Self::Json),
            "invalid_input" => Ok(Self::InvalidInput),
            "sha256_mismatch" => Ok(Self::Sha256Mismatch),
            "budget_denied" => Ok(Self::BudgetDenied),
            "invalid_job_request" => Ok(Self::InvalidJobRequest),
            "invariant" => Ok(Self::Invariant),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for StorageRpcServiceErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for StorageRpcServiceErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for StorageRpcServiceErrorCode {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`StorageRpcSuccessEnvelope`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"ok\","]
#[doc = "    \"request_id\","]
#[doc = "    \"storage_rpc_version\","]
#[doc = "    \"value\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"ok\": {"]
#[doc = "      \"type\": \"boolean\","]
#[doc = "      \"enum\": ["]
#[doc = "        true"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcRequestId\""]
#[doc = "    },"]
#[doc = "    \"storage_rpc_version\": {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcVersion\""]
#[doc = "    },"]
#[doc = "    \"value\": {"]
#[doc = "      \"anyOf\": ["]
#[doc = "        {"]
#[doc = "          \"$ref\": \"#/$defs/StorageRpcDescriptor\""]
#[doc = "        },"]
#[doc = "        {"]
#[doc = "          \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "        }"]
#[doc = "      ]"]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct StorageRpcSuccessEnvelope {
    pub ok: bool,
    pub request_id: StorageRpcRequestId,
    pub storage_rpc_version: StorageRpcVersion,
    pub value: StorageRpcSuccessEnvelopeValue,
}
#[doc = "`StorageRpcSuccessEnvelopeValue`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"anyOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcDescriptor\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
pub struct StorageRpcSuccessEnvelopeValue {
    #[serde(
        flatten,
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub subtype_0: ::std::option::Option<StorageRpcDescriptor>,
    #[serde(
        flatten,
        default,
        skip_serializing_if = "::std::option::Option::is_none"
    )]
    pub subtype_1: ::std::option::Option<::serde_json::Value>,
}
impl ::std::default::Default for StorageRpcSuccessEnvelopeValue {
    fn default() -> Self {
        Self {
            subtype_0: Default::default(),
            subtype_1: Default::default(),
        }
    }
}
#[doc = "`StorageRpcVersion`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"integer\","]
#[doc = "  \"enum\": ["]
#[doc = "    1"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct StorageRpcVersion(i64);
impl ::std::ops::Deref for StorageRpcVersion {
    type Target = i64;
    fn deref(&self) -> &i64 {
        &self.0
    }
}
impl ::std::convert::From<StorageRpcVersion> for i64 {
    fn from(value: StorageRpcVersion) -> Self {
        value.0
    }
}
impl ::std::convert::TryFrom<i64> for StorageRpcVersion {
    type Error = self::error::ConversionError;
    fn try_from(value: i64) -> ::std::result::Result<Self, self::error::ConversionError> {
        if ![1_i64].contains(&value) {
            Err("invalid value".into())
        } else {
            Ok(Self(value))
        }
    }
}
impl<'de> ::serde::Deserialize<'de> for StorageRpcVersion {
    fn deserialize<D>(deserializer: D) -> ::std::result::Result<Self, D::Error>
    where
        D: ::serde::Deserializer<'de>,
    {
        Self::try_from(<i64>::deserialize(deserializer)?)
            .map_err(|e| <D::Error as ::serde::de::Error>::custom(e.to_string()))
    }
}
#[doc = "Wanex storage RPC protocol spine. Domain command schemas are added atomically during Phase 747."]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"$id\": \"https://wanex.dev/schemas/storage-rpc/v1/storage-rpc.schema.json\","]
#[doc = "  \"title\": \"StorageRpcWireEnvelope\","]
#[doc = "  \"description\": \"Wanex storage RPC protocol spine. Domain command schemas are added atomically during Phase 747.\","]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcRequestEnvelope\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcSuccessEnvelope\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/StorageRpcErrorEnvelope\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum StorageRpcWireEnvelope {
    RequestEnvelope(StorageRpcRequestEnvelope),
    SuccessEnvelope(StorageRpcSuccessEnvelope),
    ErrorEnvelope(StorageRpcErrorEnvelope),
}
impl ::std::convert::From<StorageRpcRequestEnvelope> for StorageRpcWireEnvelope {
    fn from(value: StorageRpcRequestEnvelope) -> Self {
        Self::RequestEnvelope(value)
    }
}
impl ::std::convert::From<StorageRpcSuccessEnvelope> for StorageRpcWireEnvelope {
    fn from(value: StorageRpcSuccessEnvelope) -> Self {
        Self::SuccessEnvelope(value)
    }
}
impl ::std::convert::From<StorageRpcErrorEnvelope> for StorageRpcWireEnvelope {
    fn from(value: StorageRpcErrorEnvelope) -> Self {
        Self::ErrorEnvelope(value)
    }
}
#[doc = "`SubmitChannelDeliveryCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"submit-channel-delivery\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitChannelDeliveryWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitChannelDeliveryCommand {
    pub command: SubmitChannelDeliveryCommandCommand,
    pub request: SubmitChannelDeliveryWire,
}
#[doc = "`SubmitChannelDeliveryCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"submit-channel-delivery\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SubmitChannelDeliveryCommandCommand {
    #[serde(rename = "submit-channel-delivery")]
    SubmitChannelDelivery,
}
impl ::std::fmt::Display for SubmitChannelDeliveryCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SubmitChannelDelivery => f.write_str("submit-channel-delivery"),
        }
    }
}
impl ::std::str::FromStr for SubmitChannelDeliveryCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "submit-channel-delivery" => Ok(Self::SubmitChannelDelivery),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SubmitChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SubmitChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmitChannelDeliveryCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SubmitChannelDeliveryWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"budget_grant_id\","]
#[doc = "    \"channel_id\","]
#[doc = "    \"channel_kind\","]
#[doc = "    \"connector_id\","]
#[doc = "    \"external_thread_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"job_id\","]
#[doc = "    \"max_attempts\","]
#[doc = "    \"metadata\","]
#[doc = "    \"not_before\","]
#[doc = "    \"payload\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"priority\","]
#[doc = "    \"retry_policy\","]
#[doc = "    \"scheduled_at\","]
#[doc = "    \"target_external_identity_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"budget_grant_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"channel_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"channel_kind\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"external_thread_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"max_attempts\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"not_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"priority\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"retry_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"scheduled_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"target_external_identity_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitChannelDeliveryWire {
    pub budget_grant_id: NullableString,
    pub channel_id: ::std::string::String,
    pub channel_kind: ::std::string::String,
    pub connector_id: ::std::string::String,
    pub external_thread_id: NullableString,
    pub id: NullableString,
    pub idempotency_key: NullableString,
    pub job_id: NullableString,
    pub max_attempts: NullableInteger,
    pub metadata: ::serde_json::Value,
    pub not_before: NullableInteger,
    pub payload: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub priority: NullableInteger,
    pub retry_policy: NullableRetryPolicyWire,
    pub scheduled_at: NullableInteger,
    pub target_external_identity_id: NullableString,
}
#[doc = "`SubmitPluginActionCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"submit-plugin-action\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitPluginActionWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitPluginActionCommand {
    pub command: SubmitPluginActionCommandCommand,
    pub request: SubmitPluginActionWire,
}
#[doc = "`SubmitPluginActionCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"submit-plugin-action\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SubmitPluginActionCommandCommand {
    #[serde(rename = "submit-plugin-action")]
    SubmitPluginAction,
}
impl ::std::fmt::Display for SubmitPluginActionCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SubmitPluginAction => f.write_str("submit-plugin-action"),
        }
    }
}
impl ::std::str::FromStr for SubmitPluginActionCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "submit-plugin-action" => Ok(Self::SubmitPluginAction),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SubmitPluginActionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SubmitPluginActionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmitPluginActionCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SubmitPluginActionWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"action_id\","]
#[doc = "    \"budget_grant_id\","]
#[doc = "    \"job_id\","]
#[doc = "    \"job_idempotency_key\","]
#[doc = "    \"max_attempts\","]
#[doc = "    \"not_before\","]
#[doc = "    \"payload\","]
#[doc = "    \"plugin_id\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"priority\","]
#[doc = "    \"required_capability\","]
#[doc = "    \"retry_policy\","]
#[doc = "    \"scheduled_at\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"action_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"budget_grant_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"max_attempts\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"not_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"payload\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"priority\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"required_capability\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullablePluginCapabilityWire\""]
#[doc = "    },"]
#[doc = "    \"retry_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"scheduled_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitPluginActionWire {
    pub action_id: ::std::string::String,
    pub budget_grant_id: NullableString,
    pub job_id: NullableString,
    pub job_idempotency_key: NullableString,
    pub max_attempts: NullableInteger,
    pub not_before: NullableInteger,
    pub payload: ::serde_json::Value,
    pub plugin_id: ::std::string::String,
    pub principal_id: ::std::string::String,
    pub priority: NullableInteger,
    pub required_capability: NullablePluginCapabilityWire,
    pub retry_policy: NullableRetryPolicyWire,
    pub scheduled_at: NullableInteger,
    pub version: NullableString,
}
#[doc = "`SubmitSessionRunCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"submit-session-run\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/SubmitSessionRunWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitSessionRunCommand {
    pub command: SubmitSessionRunCommandCommand,
    pub request: SubmitSessionRunWire,
}
#[doc = "`SubmitSessionRunCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"submit-session-run\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SubmitSessionRunCommandCommand {
    #[serde(rename = "submit-session-run")]
    SubmitSessionRun,
}
impl ::std::fmt::Display for SubmitSessionRunCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::SubmitSessionRun => f.write_str("submit-session-run"),
        }
    }
}
impl ::std::str::FromStr for SubmitSessionRunCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "submit-session-run" => Ok(Self::SubmitSessionRun),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SubmitSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SubmitSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmitSessionRunCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`SubmitSessionRunWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"budget_grant_id\","]
#[doc = "    \"content\","]
#[doc = "    \"expected_run_id\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"input_type\","]
#[doc = "    \"intent\","]
#[doc = "    \"job_id\","]
#[doc = "    \"job_idempotency_key\","]
#[doc = "    \"max_attempts\","]
#[doc = "    \"max_steps\","]
#[doc = "    \"mode\","]
#[doc = "    \"not_before\","]
#[doc = "    \"origin\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"priority\","]
#[doc = "    \"provider_profile_id\","]
#[doc = "    \"retry_policy\","]
#[doc = "    \"run_control_policy\","]
#[doc = "    \"scheduled_at\","]
#[doc = "    \"session_id\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"budget_grant_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"content\": {"]
#[doc = "      \"$ref\": \"#/$defs/MessagePartsWire\""]
#[doc = "    },"]
#[doc = "    \"expected_run_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"input_type\": {"]
#[doc = "      \"oneOf\": ["]
#[doc = "        {"]
#[doc = "          \"type\": \"string\","]
#[doc = "          \"enum\": ["]
#[doc = "            \"user\","]
#[doc = "            \"system\""]
#[doc = "          ]"]
#[doc = "        },"]
#[doc = "        {"]
#[doc = "          \"type\": \"null\""]
#[doc = "        }"]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"intent\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputIntentWire\""]
#[doc = "    },"]
#[doc = "    \"job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"job_idempotency_key\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"max_attempts\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"max_steps\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"mode\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionRunModeWire\""]
#[doc = "    },"]
#[doc = "    \"not_before\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"origin\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableSessionInputOriginWire\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"priority\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"provider_profile_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"retry_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRetryPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"run_control_policy\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableRunControlPolicyWire\""]
#[doc = "    },"]
#[doc = "    \"scheduled_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct SubmitSessionRunWire {
    pub budget_grant_id: NullableString,
    pub content: MessagePartsWire,
    pub expected_run_id: NullableString,
    pub id: NullableString,
    pub idempotency_key: ::std::string::String,
    pub input_type: ::std::option::Option<SubmitSessionRunWireInputType>,
    pub intent: NullableSessionInputIntentWire,
    pub job_id: NullableString,
    pub job_idempotency_key: NullableString,
    pub max_attempts: NullableInteger,
    pub max_steps: NullableInteger,
    pub mode: NullableSessionRunModeWire,
    pub not_before: NullableInteger,
    pub origin: NullableSessionInputOriginWire,
    pub principal_id: ::std::string::String,
    pub priority: NullableInteger,
    pub provider_profile_id: NullableString,
    pub retry_policy: NullableRetryPolicyWire,
    pub run_control_policy: NullableRunControlPolicyWire,
    pub scheduled_at: NullableInteger,
    pub session_id: ::std::string::String,
}
#[doc = "`SubmitSessionRunWireInputType`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"user\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum SubmitSessionRunWireInputType {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for SubmitSessionRunWireInputType {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::User => f.write_str("user"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for SubmitSessionRunWireInputType {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "user" => Ok(Self::User),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for SubmitSessionRunWireInputType {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for SubmitSessionRunWireInputType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for SubmitSessionRunWireInputType {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`TeamAudienceParticipantIdsWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"array\","]
#[doc = "  \"items\": {"]
#[doc = "    \"type\": \"string\""]
#[doc = "  }"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct TeamAudienceParticipantIdsWire(pub ::std::vec::Vec<::std::string::String>);
impl ::std::ops::Deref for TeamAudienceParticipantIdsWire {
    type Target = ::std::vec::Vec<::std::string::String>;
    fn deref(&self) -> &::std::vec::Vec<::std::string::String> {
        &self.0
    }
}
impl ::std::convert::From<TeamAudienceParticipantIdsWire>
    for ::std::vec::Vec<::std::string::String>
{
    fn from(value: TeamAudienceParticipantIdsWire) -> Self {
        value.0
    }
}
impl ::std::convert::From<::std::vec::Vec<::std::string::String>>
    for TeamAudienceParticipantIdsWire
{
    fn from(value: ::std::vec::Vec<::std::string::String>) -> Self {
        Self(value)
    }
}
#[doc = "`TeamConversationModeWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"tl\","]
#[doc = "    \"free\","]
#[doc = "    \"hybrid\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum TeamConversationModeWire {
    #[serde(rename = "tl")]
    Tl,
    #[serde(rename = "free")]
    Free,
    #[serde(rename = "hybrid")]
    Hybrid,
}
impl ::std::fmt::Display for TeamConversationModeWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Tl => f.write_str("tl"),
            Self::Free => f.write_str("free"),
            Self::Hybrid => f.write_str("hybrid"),
        }
    }
}
impl ::std::str::FromStr for TeamConversationModeWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "tl" => Ok(Self::Tl),
            "free" => Ok(Self::Free),
            "hybrid" => Ok(Self::Hybrid),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for TeamConversationModeWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for TeamConversationModeWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TeamConversationModeWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`TeamConversationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"open\","]
#[doc = "    \"paused\","]
#[doc = "    \"closed\","]
#[doc = "    \"cancelled\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum TeamConversationStateWire {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "paused")]
    Paused,
    #[serde(rename = "closed")]
    Closed,
    #[serde(rename = "cancelled")]
    Cancelled,
}
impl ::std::fmt::Display for TeamConversationStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Open => f.write_str("open"),
            Self::Paused => f.write_str("paused"),
            Self::Closed => f.write_str("closed"),
            Self::Cancelled => f.write_str("cancelled"),
        }
    }
}
impl ::std::str::FromStr for TeamConversationStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "open" => Ok(Self::Open),
            "paused" => Ok(Self::Paused),
            "closed" => Ok(Self::Closed),
            "cancelled" => Ok(Self::Cancelled),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for TeamConversationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for TeamConversationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TeamConversationStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`TeamParticipantKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"user\","]
#[doc = "    \"agent\","]
#[doc = "    \"tool\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum TeamParticipantKindWire {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "agent")]
    Agent,
    #[serde(rename = "tool")]
    Tool,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for TeamParticipantKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::User => f.write_str("user"),
            Self::Agent => f.write_str("agent"),
            Self::Tool => f.write_str("tool"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for TeamParticipantKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "user" => Ok(Self::User),
            "agent" => Ok(Self::Agent),
            "tool" => Ok(Self::Tool),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for TeamParticipantKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for TeamParticipantKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TeamParticipantKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`TeamParticipantStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"active\","]
#[doc = "    \"muted\","]
#[doc = "    \"left\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum TeamParticipantStateWire {
    #[serde(rename = "active")]
    Active,
    #[serde(rename = "muted")]
    Muted,
    #[serde(rename = "left")]
    Left,
}
impl ::std::fmt::Display for TeamParticipantStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Active => f.write_str("active"),
            Self::Muted => f.write_str("muted"),
            Self::Left => f.write_str("left"),
        }
    }
}
impl ::std::str::FromStr for TeamParticipantStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "active" => Ok(Self::Active),
            "muted" => Ok(Self::Muted),
            "left" => Ok(Self::Left),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for TeamParticipantStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for TeamParticipantStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TeamParticipantStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`TeamStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutTeamConversationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetTeamConversationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamConversationsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateTeamConversationStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutTeamParticipantCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamParticipantsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateTeamParticipantStateCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/AppendTeamTurnCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListTeamTurnsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum TeamStorageRpcCommand {
    PutTeamConversationCommand(PutTeamConversationCommand),
    GetTeamConversationCommand(GetTeamConversationCommand),
    ListTeamConversationsCommand(ListTeamConversationsCommand),
    UpdateTeamConversationStateCommand(UpdateTeamConversationStateCommand),
    PutTeamParticipantCommand(PutTeamParticipantCommand),
    ListTeamParticipantsCommand(ListTeamParticipantsCommand),
    UpdateTeamParticipantStateCommand(UpdateTeamParticipantStateCommand),
    AppendTeamTurnCommand(AppendTeamTurnCommand),
    ListTeamTurnsCommand(ListTeamTurnsCommand),
}
impl ::std::convert::From<PutTeamConversationCommand> for TeamStorageRpcCommand {
    fn from(value: PutTeamConversationCommand) -> Self {
        Self::PutTeamConversationCommand(value)
    }
}
impl ::std::convert::From<GetTeamConversationCommand> for TeamStorageRpcCommand {
    fn from(value: GetTeamConversationCommand) -> Self {
        Self::GetTeamConversationCommand(value)
    }
}
impl ::std::convert::From<ListTeamConversationsCommand> for TeamStorageRpcCommand {
    fn from(value: ListTeamConversationsCommand) -> Self {
        Self::ListTeamConversationsCommand(value)
    }
}
impl ::std::convert::From<UpdateTeamConversationStateCommand> for TeamStorageRpcCommand {
    fn from(value: UpdateTeamConversationStateCommand) -> Self {
        Self::UpdateTeamConversationStateCommand(value)
    }
}
impl ::std::convert::From<PutTeamParticipantCommand> for TeamStorageRpcCommand {
    fn from(value: PutTeamParticipantCommand) -> Self {
        Self::PutTeamParticipantCommand(value)
    }
}
impl ::std::convert::From<ListTeamParticipantsCommand> for TeamStorageRpcCommand {
    fn from(value: ListTeamParticipantsCommand) -> Self {
        Self::ListTeamParticipantsCommand(value)
    }
}
impl ::std::convert::From<UpdateTeamParticipantStateCommand> for TeamStorageRpcCommand {
    fn from(value: UpdateTeamParticipantStateCommand) -> Self {
        Self::UpdateTeamParticipantStateCommand(value)
    }
}
impl ::std::convert::From<AppendTeamTurnCommand> for TeamStorageRpcCommand {
    fn from(value: AppendTeamTurnCommand) -> Self {
        Self::AppendTeamTurnCommand(value)
    }
}
impl ::std::convert::From<ListTeamTurnsCommand> for TeamStorageRpcCommand {
    fn from(value: ListTeamTurnsCommand) -> Self {
        Self::ListTeamTurnsCommand(value)
    }
}
#[doc = "`TeamTurnKindWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"message\","]
#[doc = "    \"decision\","]
#[doc = "    \"handoff\","]
#[doc = "    \"system\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum TeamTurnKindWire {
    #[serde(rename = "message")]
    Message,
    #[serde(rename = "decision")]
    Decision,
    #[serde(rename = "handoff")]
    Handoff,
    #[serde(rename = "system")]
    System,
}
impl ::std::fmt::Display for TeamTurnKindWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Message => f.write_str("message"),
            Self::Decision => f.write_str("decision"),
            Self::Handoff => f.write_str("handoff"),
            Self::System => f.write_str("system"),
        }
    }
}
impl ::std::str::FromStr for TeamTurnKindWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "message" => Ok(Self::Message),
            "decision" => Ok(Self::Decision),
            "handoff" => Ok(Self::Handoff),
            "system" => Ok(Self::System),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for TeamTurnKindWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for TeamTurnKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for TeamTurnKindWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ToolExecutionRecordWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"attempt\","]
#[doc = "    \"created_at\","]
#[doc = "    \"descriptor\","]
#[doc = "    \"error\","]
#[doc = "    \"finished_at\","]
#[doc = "    \"id\","]
#[doc = "    \"idempotency_key\","]
#[doc = "    \"input\","]
#[doc = "    \"input_id\","]
#[doc = "    \"is_error\","]
#[doc = "    \"permission\","]
#[doc = "    \"principal_id\","]
#[doc = "    \"result\","]
#[doc = "    \"run_id\","]
#[doc = "    \"session_id\","]
#[doc = "    \"started_at\","]
#[doc = "    \"state\","]
#[doc = "    \"tool_call_id\","]
#[doc = "    \"tool_name\","]
#[doc = "    \"updated_at\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"attempt\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"created_at\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    },"]
#[doc = "    \"descriptor\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"error\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"finished_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"idempotency_key\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"input\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"input_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"is_error\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableBoolean\""]
#[doc = "    },"]
#[doc = "    \"permission\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"principal_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"result\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"run_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"session_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"started_at\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableInteger\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/ToolExecutionStateWire\""]
#[doc = "    },"]
#[doc = "    \"tool_call_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"tool_name\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"updated_at\": {"]
#[doc = "      \"type\": \"integer\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct ToolExecutionRecordWire {
    pub attempt: i64,
    pub created_at: i64,
    pub descriptor: ::serde_json::Value,
    pub error: ::serde_json::Value,
    pub finished_at: NullableInteger,
    pub id: ::std::string::String,
    pub idempotency_key: ::std::string::String,
    pub input: ::serde_json::Value,
    pub input_id: ::std::string::String,
    pub is_error: NullableBoolean,
    pub permission: ::serde_json::Value,
    pub principal_id: ::std::string::String,
    pub result: ::serde_json::Value,
    pub run_id: ::std::string::String,
    pub session_id: ::std::string::String,
    pub started_at: NullableInteger,
    pub state: ToolExecutionStateWire,
    pub tool_call_id: ::std::string::String,
    pub tool_name: ::std::string::String,
    pub updated_at: i64,
}
#[doc = "`ToolExecutionStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"running\","]
#[doc = "    \"denied\","]
#[doc = "    \"approval_required\","]
#[doc = "    \"succeeded\","]
#[doc = "    \"failed\","]
#[doc = "    \"cancelled\","]
#[doc = "    \"recovery_required\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum ToolExecutionStateWire {
    #[serde(rename = "running")]
    Running,
    #[serde(rename = "denied")]
    Denied,
    #[serde(rename = "approval_required")]
    ApprovalRequired,
    #[serde(rename = "succeeded")]
    Succeeded,
    #[serde(rename = "failed")]
    Failed,
    #[serde(rename = "cancelled")]
    Cancelled,
    #[serde(rename = "recovery_required")]
    RecoveryRequired,
}
impl ::std::fmt::Display for ToolExecutionStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Running => f.write_str("running"),
            Self::Denied => f.write_str("denied"),
            Self::ApprovalRequired => f.write_str("approval_required"),
            Self::Succeeded => f.write_str("succeeded"),
            Self::Failed => f.write_str("failed"),
            Self::Cancelled => f.write_str("cancelled"),
            Self::RecoveryRequired => f.write_str("recovery_required"),
        }
    }
}
impl ::std::str::FromStr for ToolExecutionStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "running" => Ok(Self::Running),
            "denied" => Ok(Self::Denied),
            "approval_required" => Ok(Self::ApprovalRequired),
            "succeeded" => Ok(Self::Succeeded),
            "failed" => Ok(Self::Failed),
            "cancelled" => Ok(Self::Cancelled),
            "recovery_required" => Ok(Self::RecoveryRequired),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for ToolExecutionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for ToolExecutionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for ToolExecutionStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`ToolsStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/BeginToolExecutionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/FinishToolExecutionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecoverToolExecutionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetToolExecutionCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListToolExecutionsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum ToolsStorageRpcCommand {
    BeginToolExecutionCommand(BeginToolExecutionCommand),
    FinishToolExecutionCommand(FinishToolExecutionCommand),
    RecoverToolExecutionCommand(RecoverToolExecutionCommand),
    GetToolExecutionCommand(GetToolExecutionCommand),
    ListToolExecutionsCommand(ListToolExecutionsCommand),
}
impl ::std::convert::From<BeginToolExecutionCommand> for ToolsStorageRpcCommand {
    fn from(value: BeginToolExecutionCommand) -> Self {
        Self::BeginToolExecutionCommand(value)
    }
}
impl ::std::convert::From<FinishToolExecutionCommand> for ToolsStorageRpcCommand {
    fn from(value: FinishToolExecutionCommand) -> Self {
        Self::FinishToolExecutionCommand(value)
    }
}
impl ::std::convert::From<RecoverToolExecutionCommand> for ToolsStorageRpcCommand {
    fn from(value: RecoverToolExecutionCommand) -> Self {
        Self::RecoverToolExecutionCommand(value)
    }
}
impl ::std::convert::From<GetToolExecutionCommand> for ToolsStorageRpcCommand {
    fn from(value: GetToolExecutionCommand) -> Self {
        Self::GetToolExecutionCommand(value)
    }
}
impl ::std::convert::From<ListToolExecutionsCommand> for ToolsStorageRpcCommand {
    fn from(value: ListToolExecutionsCommand) -> Self {
        Self::ListToolExecutionsCommand(value)
    }
}
#[doc = "`Unsigned32`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"integer\","]
#[doc = "  \"maximum\": 4294967295.0,"]
#[doc = "  \"minimum\": 0.0"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(transparent)]
pub struct Unsigned32(pub u32);
impl ::std::ops::Deref for Unsigned32 {
    type Target = u32;
    fn deref(&self) -> &u32 {
        &self.0
    }
}
impl ::std::convert::From<Unsigned32> for u32 {
    fn from(value: Unsigned32) -> Self {
        value.0
    }
}
impl ::std::convert::From<u32> for Unsigned32 {
    fn from(value: u32) -> Self {
        Self(value)
    }
}
impl ::std::str::FromStr for Unsigned32 {
    type Err = <u32 as ::std::str::FromStr>::Err;
    fn from_str(value: &str) -> ::std::result::Result<Self, Self::Err> {
        Ok(Self(value.parse()?))
    }
}
impl ::std::convert::TryFrom<&str> for Unsigned32 {
    type Error = <u32 as ::std::str::FromStr>::Err;
    fn try_from(value: &str) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<String> for Unsigned32 {
    type Error = <u32 as ::std::str::FromStr>::Err;
    fn try_from(value: String) -> ::std::result::Result<Self, Self::Error> {
        value.parse()
    }
}
impl ::std::fmt::Display for Unsigned32 {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        self.0.fmt(f)
    }
}
#[doc = "`UpdateChannelInboundEventStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-channel-inbound-event-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateChannelInboundEventStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateChannelInboundEventStateCommand {
    pub command: UpdateChannelInboundEventStateCommandCommand,
    pub request: UpdateChannelInboundEventStateWire,
}
#[doc = "`UpdateChannelInboundEventStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-channel-inbound-event-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateChannelInboundEventStateCommandCommand {
    #[serde(rename = "update-channel-inbound-event-state")]
    UpdateChannelInboundEventState,
}
impl ::std::fmt::Display for UpdateChannelInboundEventStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateChannelInboundEventState => {
                f.write_str("update-channel-inbound-event-state")
            }
        }
    }
}
impl ::std::str::FromStr for UpdateChannelInboundEventStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-channel-inbound-event-state" => Ok(Self::UpdateChannelInboundEventState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateChannelInboundEventStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateChannelInboundEventStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for UpdateChannelInboundEventStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateChannelInboundEventStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"event_id\","]
#[doc = "    \"metadata\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"event_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/ChannelInboundEventStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateChannelInboundEventStateWire {
    pub event_id: ::std::string::String,
    pub metadata: ::serde_json::Value,
    pub state: ChannelInboundEventStateWire,
}
#[doc = "`UpdateConnectorRegistrationStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-connector-registration-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateConnectorRegistrationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateConnectorRegistrationStateCommand {
    pub command: UpdateConnectorRegistrationStateCommandCommand,
    pub request: UpdateConnectorRegistrationStateWire,
}
#[doc = "`UpdateConnectorRegistrationStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-connector-registration-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateConnectorRegistrationStateCommandCommand {
    #[serde(rename = "update-connector-registration-state")]
    UpdateConnectorRegistrationState,
}
impl ::std::fmt::Display for UpdateConnectorRegistrationStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateConnectorRegistrationState => {
                f.write_str("update-connector-registration-state")
            }
        }
    }
}
impl ::std::str::FromStr for UpdateConnectorRegistrationStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-connector-registration-state" => Ok(Self::UpdateConnectorRegistrationState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateConnectorRegistrationStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateConnectorRegistrationStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for UpdateConnectorRegistrationStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateConnectorRegistrationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"connector_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"connector_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/ConnectorRegistrationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateConnectorRegistrationStateWire {
    pub connector_id: ::std::string::String,
    pub state: ConnectorRegistrationStateWire,
}
#[doc = "`UpdateDelegationGraphNodeStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-delegation-graph-node-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateDelegationGraphNodeStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateDelegationGraphNodeStateCommand {
    pub command: UpdateDelegationGraphNodeStateCommandCommand,
    pub request: UpdateDelegationGraphNodeStateWire,
}
#[doc = "`UpdateDelegationGraphNodeStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-delegation-graph-node-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateDelegationGraphNodeStateCommandCommand {
    #[serde(rename = "update-delegation-graph-node-state")]
    UpdateDelegationGraphNodeState,
}
impl ::std::fmt::Display for UpdateDelegationGraphNodeStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateDelegationGraphNodeState => {
                f.write_str("update-delegation-graph-node-state")
            }
        }
    }
}
impl ::std::str::FromStr for UpdateDelegationGraphNodeStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-delegation-graph-node-state" => Ok(Self::UpdateDelegationGraphNodeState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateDelegationGraphNodeStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String>
    for UpdateDelegationGraphNodeStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String>
    for UpdateDelegationGraphNodeStateCommandCommand
{
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateDelegationGraphNodeStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"metadata\","]
#[doc = "    \"node_id\","]
#[doc = "    \"scheduler_job_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"metadata\": {"]
#[doc = "      \"$ref\": \"#/$defs/JsonValue\""]
#[doc = "    },"]
#[doc = "    \"node_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"scheduler_job_id\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationNodeStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateDelegationGraphNodeStateWire {
    pub metadata: ::serde_json::Value,
    pub node_id: ::std::string::String,
    pub scheduler_job_id: NullableString,
    pub state: DelegationNodeStateWire,
}
#[doc = "`UpdateDelegationGraphStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-delegation-graph-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateDelegationGraphStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateDelegationGraphStateCommand {
    pub command: UpdateDelegationGraphStateCommandCommand,
    pub request: UpdateDelegationGraphStateWire,
}
#[doc = "`UpdateDelegationGraphStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-delegation-graph-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateDelegationGraphStateCommandCommand {
    #[serde(rename = "update-delegation-graph-state")]
    UpdateDelegationGraphState,
}
impl ::std::fmt::Display for UpdateDelegationGraphStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateDelegationGraphState => f.write_str("update-delegation-graph-state"),
        }
    }
}
impl ::std::str::FromStr for UpdateDelegationGraphStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-delegation-graph-state" => Ok(Self::UpdateDelegationGraphState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateDelegationGraphStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for UpdateDelegationGraphStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for UpdateDelegationGraphStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateDelegationGraphStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"graph_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"graph_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/DelegationGraphStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateDelegationGraphStateWire {
    pub graph_id: ::std::string::String,
    pub state: DelegationGraphStateWire,
}
#[doc = "`UpdatePluginInstallStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-plugin-install-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdatePluginInstallStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginInstallStateCommand {
    pub command: UpdatePluginInstallStateCommandCommand,
    pub request: UpdatePluginInstallStateWire,
}
#[doc = "`UpdatePluginInstallStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-plugin-install-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdatePluginInstallStateCommandCommand {
    #[serde(rename = "update-plugin-install-state")]
    UpdatePluginInstallState,
}
impl ::std::fmt::Display for UpdatePluginInstallStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdatePluginInstallState => f.write_str("update-plugin-install-state"),
        }
    }
}
impl ::std::str::FromStr for UpdatePluginInstallStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-plugin-install-state" => Ok(Self::UpdatePluginInstallState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdatePluginInstallStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for UpdatePluginInstallStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for UpdatePluginInstallStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdatePluginInstallStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"plugin_id\","]
#[doc = "    \"state\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/PluginInstallStateWire\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginInstallStateWire {
    pub plugin_id: ::std::string::String,
    pub state: PluginInstallStateWire,
    pub version: NullableString,
}
#[doc = "`UpdatePluginManifestStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-plugin-manifest-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdatePluginManifestStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginManifestStateCommand {
    pub command: UpdatePluginManifestStateCommandCommand,
    pub request: UpdatePluginManifestStateWire,
}
#[doc = "`UpdatePluginManifestStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-plugin-manifest-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdatePluginManifestStateCommandCommand {
    #[serde(rename = "update-plugin-manifest-state")]
    UpdatePluginManifestState,
}
impl ::std::fmt::Display for UpdatePluginManifestStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdatePluginManifestState => f.write_str("update-plugin-manifest-state"),
        }
    }
}
impl ::std::str::FromStr for UpdatePluginManifestStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-plugin-manifest-state" => Ok(Self::UpdatePluginManifestState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdatePluginManifestStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for UpdatePluginManifestStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for UpdatePluginManifestStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdatePluginManifestStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"plugin_id\","]
#[doc = "    \"state\","]
#[doc = "    \"version\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"plugin_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/PluginManifestStateWire\""]
#[doc = "    },"]
#[doc = "    \"version\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdatePluginManifestStateWire {
    pub plugin_id: ::std::string::String,
    pub state: PluginManifestStateWire,
    pub version: NullableString,
}
#[doc = "`UpdateTeamConversationStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-team-conversation-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateTeamConversationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateTeamConversationStateCommand {
    pub command: UpdateTeamConversationStateCommandCommand,
    pub request: UpdateTeamConversationStateWire,
}
#[doc = "`UpdateTeamConversationStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-team-conversation-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateTeamConversationStateCommandCommand {
    #[serde(rename = "update-team-conversation-state")]
    UpdateTeamConversationState,
}
impl ::std::fmt::Display for UpdateTeamConversationStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateTeamConversationState => f.write_str("update-team-conversation-state"),
        }
    }
}
impl ::std::str::FromStr for UpdateTeamConversationStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-team-conversation-state" => Ok(Self::UpdateTeamConversationState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateTeamConversationStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for UpdateTeamConversationStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for UpdateTeamConversationStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateTeamConversationStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"conversation_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"conversation_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/TeamConversationStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateTeamConversationStateWire {
    pub conversation_id: ::std::string::String,
    pub state: TeamConversationStateWire,
}
#[doc = "`UpdateTeamParticipantStateCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"request\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"update-team-participant-state\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"request\": {"]
#[doc = "      \"$ref\": \"#/$defs/UpdateTeamParticipantStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateTeamParticipantStateCommand {
    pub command: UpdateTeamParticipantStateCommandCommand,
    pub request: UpdateTeamParticipantStateWire,
}
#[doc = "`UpdateTeamParticipantStateCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"update-team-participant-state\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum UpdateTeamParticipantStateCommandCommand {
    #[serde(rename = "update-team-participant-state")]
    UpdateTeamParticipantState,
}
impl ::std::fmt::Display for UpdateTeamParticipantStateCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::UpdateTeamParticipantState => f.write_str("update-team-participant-state"),
        }
    }
}
impl ::std::str::FromStr for UpdateTeamParticipantStateCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "update-team-participant-state" => Ok(Self::UpdateTeamParticipantState),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for UpdateTeamParticipantStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for UpdateTeamParticipantStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for UpdateTeamParticipantStateCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`UpdateTeamParticipantStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"participant_id\","]
#[doc = "    \"state\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"participant_id\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"state\": {"]
#[doc = "      \"$ref\": \"#/$defs/TeamParticipantStateWire\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct UpdateTeamParticipantStateWire {
    pub participant_id: ::std::string::String,
    pub state: TeamParticipantStateWire,
}
#[doc = "`WorkspaceChangeOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"apply\","]
#[doc = "    \"undo\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkspaceChangeOperationWire {
    #[serde(rename = "apply")]
    Apply,
    #[serde(rename = "undo")]
    Undo,
}
impl ::std::fmt::Display for WorkspaceChangeOperationWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Apply => f.write_str("apply"),
            Self::Undo => f.write_str("undo"),
        }
    }
}
impl ::std::str::FromStr for WorkspaceChangeOperationWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "apply" => Ok(Self::Apply),
            "undo" => Ok(Self::Undo),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkspaceChangeOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WorkspaceChangeOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkspaceChangeOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkspaceChangeProposalOperationWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"approve\","]
#[doc = "    \"reject\","]
#[doc = "    \"withdraw\","]
#[doc = "    \"request_apply\","]
#[doc = "    \"mark_applied\","]
#[doc = "    \"mark_apply_failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkspaceChangeProposalOperationWire {
    #[serde(rename = "approve")]
    Approve,
    #[serde(rename = "reject")]
    Reject,
    #[serde(rename = "withdraw")]
    Withdraw,
    #[serde(rename = "request_apply")]
    RequestApply,
    #[serde(rename = "mark_applied")]
    MarkApplied,
    #[serde(rename = "mark_apply_failed")]
    MarkApplyFailed,
}
impl ::std::fmt::Display for WorkspaceChangeProposalOperationWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Approve => f.write_str("approve"),
            Self::Reject => f.write_str("reject"),
            Self::Withdraw => f.write_str("withdraw"),
            Self::RequestApply => f.write_str("request_apply"),
            Self::MarkApplied => f.write_str("mark_applied"),
            Self::MarkApplyFailed => f.write_str("mark_apply_failed"),
        }
    }
}
impl ::std::str::FromStr for WorkspaceChangeProposalOperationWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "approve" => Ok(Self::Approve),
            "reject" => Ok(Self::Reject),
            "withdraw" => Ok(Self::Withdraw),
            "request_apply" => Ok(Self::RequestApply),
            "mark_applied" => Ok(Self::MarkApplied),
            "mark_apply_failed" => Ok(Self::MarkApplyFailed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkspaceChangeProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WorkspaceChangeProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkspaceChangeProposalOperationWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkspaceChangeProposalStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"open\","]
#[doc = "    \"approved\","]
#[doc = "    \"rejected\","]
#[doc = "    \"withdrawn\","]
#[doc = "    \"apply_requested\","]
#[doc = "    \"applied\","]
#[doc = "    \"apply_failed\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkspaceChangeProposalStateWire {
    #[serde(rename = "open")]
    Open,
    #[serde(rename = "approved")]
    Approved,
    #[serde(rename = "rejected")]
    Rejected,
    #[serde(rename = "withdrawn")]
    Withdrawn,
    #[serde(rename = "apply_requested")]
    ApplyRequested,
    #[serde(rename = "applied")]
    Applied,
    #[serde(rename = "apply_failed")]
    ApplyFailed,
}
impl ::std::fmt::Display for WorkspaceChangeProposalStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Open => f.write_str("open"),
            Self::Approved => f.write_str("approved"),
            Self::Rejected => f.write_str("rejected"),
            Self::Withdrawn => f.write_str("withdrawn"),
            Self::ApplyRequested => f.write_str("apply_requested"),
            Self::Applied => f.write_str("applied"),
            Self::ApplyFailed => f.write_str("apply_failed"),
        }
    }
}
impl ::std::str::FromStr for WorkspaceChangeProposalStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "open" => Ok(Self::Open),
            "approved" => Ok(Self::Approved),
            "rejected" => Ok(Self::Rejected),
            "withdrawn" => Ok(Self::Withdrawn),
            "apply_requested" => Ok(Self::ApplyRequested),
            "applied" => Ok(Self::Applied),
            "apply_failed" => Ok(Self::ApplyFailed),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkspaceChangeProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WorkspaceChangeProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkspaceChangeProposalStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkspaceChangeSetStateWire`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"submitted\","]
#[doc = "    \"applied\","]
#[doc = "    \"already_applied\","]
#[doc = "    \"conflicted\","]
#[doc = "    \"undone\","]
#[doc = "    \"undo_conflicted\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WorkspaceChangeSetStateWire {
    #[serde(rename = "submitted")]
    Submitted,
    #[serde(rename = "applied")]
    Applied,
    #[serde(rename = "already_applied")]
    AlreadyApplied,
    #[serde(rename = "conflicted")]
    Conflicted,
    #[serde(rename = "undone")]
    Undone,
    #[serde(rename = "undo_conflicted")]
    UndoConflicted,
}
impl ::std::fmt::Display for WorkspaceChangeSetStateWire {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::Submitted => f.write_str("submitted"),
            Self::Applied => f.write_str("applied"),
            Self::AlreadyApplied => f.write_str("already_applied"),
            Self::Conflicted => f.write_str("conflicted"),
            Self::Undone => f.write_str("undone"),
            Self::UndoConflicted => f.write_str("undo_conflicted"),
        }
    }
}
impl ::std::str::FromStr for WorkspaceChangeSetStateWire {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "submitted" => Ok(Self::Submitted),
            "applied" => Ok(Self::Applied),
            "already_applied" => Ok(Self::AlreadyApplied),
            "conflicted" => Ok(Self::Conflicted),
            "undone" => Ok(Self::Undone),
            "undo_conflicted" => Ok(Self::UndoConflicted),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WorkspaceChangeSetStateWire {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WorkspaceChangeSetStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WorkspaceChangeSetStateWire {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
#[doc = "`WorkspaceStorageRpcCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"oneOf\": ["]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutWorkspaceChangeSetCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetWorkspaceChangeSetCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeSetsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecordWorkspaceChangeOperationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeOperationsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/PutWorkspaceChangeProposalCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/GetWorkspaceChangeProposalCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeProposalsCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/RecordWorkspaceChangeProposalOperationCommand\""]
#[doc = "    },"]
#[doc = "    {"]
#[doc = "      \"$ref\": \"#/$defs/ListWorkspaceChangeProposalOperationsCommand\""]
#[doc = "    }"]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(untagged)]
pub enum WorkspaceStorageRpcCommand {
    PutWorkspaceChangeSetCommand(PutWorkspaceChangeSetCommand),
    GetWorkspaceChangeSetCommand(GetWorkspaceChangeSetCommand),
    ListWorkspaceChangeSetsCommand(ListWorkspaceChangeSetsCommand),
    RecordWorkspaceChangeOperationCommand(RecordWorkspaceChangeOperationCommand),
    ListWorkspaceChangeOperationsCommand(ListWorkspaceChangeOperationsCommand),
    PutWorkspaceChangeProposalCommand(PutWorkspaceChangeProposalCommand),
    GetWorkspaceChangeProposalCommand(GetWorkspaceChangeProposalCommand),
    ListWorkspaceChangeProposalsCommand(ListWorkspaceChangeProposalsCommand),
    RecordWorkspaceChangeProposalOperationCommand(RecordWorkspaceChangeProposalOperationCommand),
    ListWorkspaceChangeProposalOperationsCommand(ListWorkspaceChangeProposalOperationsCommand),
}
impl ::std::convert::From<PutWorkspaceChangeSetCommand> for WorkspaceStorageRpcCommand {
    fn from(value: PutWorkspaceChangeSetCommand) -> Self {
        Self::PutWorkspaceChangeSetCommand(value)
    }
}
impl ::std::convert::From<GetWorkspaceChangeSetCommand> for WorkspaceStorageRpcCommand {
    fn from(value: GetWorkspaceChangeSetCommand) -> Self {
        Self::GetWorkspaceChangeSetCommand(value)
    }
}
impl ::std::convert::From<ListWorkspaceChangeSetsCommand> for WorkspaceStorageRpcCommand {
    fn from(value: ListWorkspaceChangeSetsCommand) -> Self {
        Self::ListWorkspaceChangeSetsCommand(value)
    }
}
impl ::std::convert::From<RecordWorkspaceChangeOperationCommand> for WorkspaceStorageRpcCommand {
    fn from(value: RecordWorkspaceChangeOperationCommand) -> Self {
        Self::RecordWorkspaceChangeOperationCommand(value)
    }
}
impl ::std::convert::From<ListWorkspaceChangeOperationsCommand> for WorkspaceStorageRpcCommand {
    fn from(value: ListWorkspaceChangeOperationsCommand) -> Self {
        Self::ListWorkspaceChangeOperationsCommand(value)
    }
}
impl ::std::convert::From<PutWorkspaceChangeProposalCommand> for WorkspaceStorageRpcCommand {
    fn from(value: PutWorkspaceChangeProposalCommand) -> Self {
        Self::PutWorkspaceChangeProposalCommand(value)
    }
}
impl ::std::convert::From<GetWorkspaceChangeProposalCommand> for WorkspaceStorageRpcCommand {
    fn from(value: GetWorkspaceChangeProposalCommand) -> Self {
        Self::GetWorkspaceChangeProposalCommand(value)
    }
}
impl ::std::convert::From<ListWorkspaceChangeProposalsCommand> for WorkspaceStorageRpcCommand {
    fn from(value: ListWorkspaceChangeProposalsCommand) -> Self {
        Self::ListWorkspaceChangeProposalsCommand(value)
    }
}
impl ::std::convert::From<RecordWorkspaceChangeProposalOperationCommand>
    for WorkspaceStorageRpcCommand
{
    fn from(value: RecordWorkspaceChangeProposalOperationCommand) -> Self {
        Self::RecordWorkspaceChangeProposalOperationCommand(value)
    }
}
impl ::std::convert::From<ListWorkspaceChangeProposalOperationsCommand>
    for WorkspaceStorageRpcCommand
{
    fn from(value: ListWorkspaceChangeProposalOperationsCommand) -> Self {
        Self::ListWorkspaceChangeProposalOperationsCommand(value)
    }
}
#[doc = "`WriteAtomicFileCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"object\","]
#[doc = "  \"required\": ["]
#[doc = "    \"command\","]
#[doc = "    \"content_base64\","]
#[doc = "    \"expected_sha256\","]
#[doc = "    \"logical_path\""]
#[doc = "  ],"]
#[doc = "  \"properties\": {"]
#[doc = "    \"command\": {"]
#[doc = "      \"type\": \"string\","]
#[doc = "      \"enum\": ["]
#[doc = "        \"write-atomic-file\""]
#[doc = "      ]"]
#[doc = "    },"]
#[doc = "    \"content_base64\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    },"]
#[doc = "    \"expected_sha256\": {"]
#[doc = "      \"$ref\": \"#/$defs/NullableString\""]
#[doc = "    },"]
#[doc = "    \"logical_path\": {"]
#[doc = "      \"type\": \"string\""]
#[doc = "    }"]
#[doc = "  },"]
#[doc = "  \"additionalProperties\": false"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(:: serde :: Deserialize, :: serde :: Serialize, Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct WriteAtomicFileCommand {
    pub command: WriteAtomicFileCommandCommand,
    pub content_base64: ::std::string::String,
    pub expected_sha256: NullableString,
    pub logical_path: ::std::string::String,
}
#[doc = "`WriteAtomicFileCommandCommand`"]
#[doc = r""]
#[doc = r" <details><summary>JSON schema</summary>"]
#[doc = r""]
#[doc = r" ```json"]
#[doc = "{"]
#[doc = "  \"type\": \"string\","]
#[doc = "  \"enum\": ["]
#[doc = "    \"write-atomic-file\""]
#[doc = "  ]"]
#[doc = "}"]
#[doc = r" ```"]
#[doc = r" </details>"]
#[derive(
    :: serde :: Deserialize,
    :: serde :: Serialize,
    Clone,
    Copy,
    Debug,
    Eq,
    Hash,
    Ord,
    PartialEq,
    PartialOrd,
)]
pub enum WriteAtomicFileCommandCommand {
    #[serde(rename = "write-atomic-file")]
    WriteAtomicFile,
}
impl ::std::fmt::Display for WriteAtomicFileCommandCommand {
    fn fmt(&self, f: &mut ::std::fmt::Formatter<'_>) -> ::std::fmt::Result {
        match *self {
            Self::WriteAtomicFile => f.write_str("write-atomic-file"),
        }
    }
}
impl ::std::str::FromStr for WriteAtomicFileCommandCommand {
    type Err = self::error::ConversionError;
    fn from_str(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        match value {
            "write-atomic-file" => Ok(Self::WriteAtomicFile),
            _ => Err("invalid value".into()),
        }
    }
}
impl ::std::convert::TryFrom<&str> for WriteAtomicFileCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(value: &str) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<&::std::string::String> for WriteAtomicFileCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: &::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}
impl ::std::convert::TryFrom<::std::string::String> for WriteAtomicFileCommandCommand {
    type Error = self::error::ConversionError;
    fn try_from(
        value: ::std::string::String,
    ) -> ::std::result::Result<Self, self::error::ConversionError> {
        value.parse()
    }
}

pub const STORAGE_RPC_SCHEMA_SHA256: &str =
    "ee5daeea5adec04a7b839ed1908bb5aeb127b65856c07a7beea1339c54f75db9";
